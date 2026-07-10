"""Combina o texto de loja extraído (Fase 2) com as linhas reais da planilha.

O texto que chega do Sistema GIV é descritivo e verboso
("SUPERMERCADOS SUPER SO AEROPORTO SETE LAGOAS"), enquanto o REDE na
planilha é um apelido curto ("SUPER SO LJ 6 AEROPORTO"). Comparar direto por
igualdade não funciona — por isso:

1. Primeiro filtra pelas linhas do mês/ano certo.
2. Se houver cidade, restringe às linhas dessa cidade (reduz muito o
   universo de comparação e evita confundir lojas de cidades diferentes
   com nomes parecidos, ex.: "SUPER SO CENTRO" existe em várias cidades).
3. Só então faz fuzzy match do nome dentro desse conjunto reduzido.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from rapidfuzz import fuzz
from sqlalchemy.orm import Session

from core.common.text import normalize_text
from core.db.models import StoreCache

# Abaixo disso, o candidato não é confiável o suficiente para gravar sozinho.
MATCH_CONFIDENCE_THRESHOLD = 0.70

# Redes com várias filiais numeradas (ex.: "PANELÃO LJ 08" vs "PANELÃO LJ 09")
# são quase idênticas em texto — só o número muda. O token_set_ratio sozinho
# não dá peso especial a isso (uma string mais curta com número errado pode
# pontuar mais alto que a correta só por ter menos caracteres). Por isso,
# quando o texto de origem e a loja candidata têm números e eles não batem,
# o placar leva uma penalidade forte.
_NUMBER_RE = re.compile(r"\d+")
NUMBER_MISMATCH_PENALTY = 0.5

# A planilha abrevia "LOJA" como "LJ" e não usa zero à esquerda no número
# (ex.: "LJ 08" na coluna REDE vs promotor escrevendo "loja 8" na legenda).
# Sem canonizar os dois lados, esse tipo de loja perde pontos de match por
# um detalhe puramente de formatação, mesmo quando é claramente a mesma loja.
_LOJA_WORD_RE = re.compile(r"\bLOJA\b")


def _canonicalize_store_text(text: str) -> str:
    text = _LOJA_WORD_RE.sub("LJ", text)
    return _NUMBER_RE.sub(lambda m: str(int(m.group())), text)


def _extract_numbers(text: str) -> set[str]:
    return {str(int(n)) for n in _NUMBER_RE.findall(text)}


# Legenda às vezes não tem NADA além do número da loja ("8") ou só o nome da
# cidade ("Carmópolis") — sem nome de rede nenhum. Comparação de texto fuzzy
# sozinha não dá conta disso (pontua baixo contra qualquer coisa), então
# esses dois casos ganham atalhos dedicados abaixo.
_HAS_LETTER_RE = re.compile(r"[A-Z]")

# Quando os dois melhores candidatos empatam (ou quase), a diferença não é
# confiança de verdade — é sorte da ordenação. Nesses casos é mais seguro
# cair em revisão manual do que arriscar gravar na loja errada.
AMBIGUITY_MARGIN = 0.03


@dataclass
class StoreRow:
    row_number: int
    rede: str
    marca: str | None
    cidade: str | None
    mes_ano: str


@dataclass
class StoreMatch:
    row: StoreRow | None
    score: float  # 0.0 a 1.0
    candidates: list[tuple[StoreRow, float]]  # ordenado por score desc


def load_rows_from_sheet(worksheet, project_config: dict) -> list[StoreRow]:
    columns = project_config["sheets"]["columns"]
    header_row = project_config["sheets"].get("header_row", 1)
    data_start = project_config["sheets"].get("data_start_row", header_row + 1)

    all_values = worksheet.get_all_values()
    header = all_values[header_row - 1]
    col_index = {name: idx for idx, name in enumerate(header)}

    rede_idx = col_index[columns["rede"]]
    marca_idx = col_index.get(columns["marca"])
    cidade_idx = col_index.get(columns["cidade"])
    mes_ano_idx = col_index[columns["mes_ano"]]

    rows: list[StoreRow] = []
    for i, values in enumerate(all_values[data_start - 1 :], start=data_start):
        if len(values) <= rede_idx or not values[rede_idx].strip():
            continue
        rows.append(
            StoreRow(
                row_number=i,
                rede=values[rede_idx].strip(),
                marca=values[marca_idx].strip() if marca_idx is not None and len(values) > marca_idx else None,
                cidade=values[cidade_idx].strip() if cidade_idx is not None and len(values) > cidade_idx else None,
                mes_ano=values[mes_ano_idx].strip() if len(values) > mes_ano_idx else "",
            )
        )
    return rows


def sync_cache(session: Session, project: str, worksheet_name: str, rows: list[StoreRow]) -> None:
    """Atualiza o cache local (SQLite) com as linhas lidas de uma aba.

    Filtra por (project, worksheet_name) ao limpar — um projeto pode gravar
    em mais de uma aba (roteamento por promotor), então atualizar o cache de
    uma aba não pode apagar o cache das outras.
    """
    session.query(StoreCache).filter(
        StoreCache.project == project, StoreCache.worksheet_name == worksheet_name
    ).delete()
    for row in rows:
        session.add(
            StoreCache(
                project=project,
                worksheet_name=worksheet_name,
                rede=row.rede,
                marca=row.marca,
                cidade=row.cidade,
                mes_ano=row.mes_ano,
                row_number=row.row_number,
            )
        )


def find_match(
    rows: list[StoreRow],
    store_text: str,
    mes_ano: str,
    city_text: str | None = None,
) -> StoreMatch:
    candidates_pool = [r for r in rows if r.mes_ano == mes_ano]
    if not candidates_pool:
        return StoreMatch(row=None, score=0.0, candidates=[])

    normalized_target_raw = normalize_text(store_text)

    if city_text:
        by_city = [r for r in candidates_pool if normalize_text(r.cidade) == normalize_text(city_text)]
        if by_city:
            candidates_pool = by_city
    else:
        # Legenda só com o nome da cidade, sem nome de rede nenhum: se só
        # existe uma loja dessa cidade no mês, é ela — não tem outro sinal
        # pra comparar mesmo, e não faz sentido pedir confirmação humana
        # de uma coisa inequívoca.
        auto_city_rows = [
            r for r in candidates_pool if r.cidade and normalize_text(r.cidade) == normalized_target_raw
        ]
        if len(auto_city_rows) == 1:
            return StoreMatch(row=auto_city_rows[0], score=1.0, candidates=[(auto_city_rows[0], 1.0)])
        if auto_city_rows:
            candidates_pool = auto_city_rows

    normalized_target = _canonicalize_store_text(normalized_target_raw)
    target_numbers = _extract_numbers(normalized_target)

    # Legenda só com o número da loja ("8"), sem nome de rede: fuzzy score
    # de texto pontua mal pra isso (a maior parte da rede real é nome, não
    # número). Se o número aparece em uma única loja do conjunto, usa isso
    # direto em vez de arriscar o fuzzy escolher errado ou não achar nada.
    if target_numbers and not _HAS_LETTER_RE.search(normalized_target):
        number_rows = [
            r
            for r in candidates_pool
            if target_numbers & _extract_numbers(_canonicalize_store_text(normalize_text(r.rede)))
        ]
        if len(number_rows) == 1:
            return StoreMatch(row=number_rows[0], score=1.0, candidates=[(number_rows[0], 1.0)])

    scored = []
    for row in candidates_pool:
        normalized_rede = _canonicalize_store_text(normalize_text(row.rede))
        # token_set_ratio sozinho favorece demais um candidato curto que seja
        # um subconjunto perfeito do texto de origem (ex.: "OLIVEIRA" pontua
        # 100 contra "SUPERMERCADO OLIVEIRA CLAUDIO MG", mesmo quando existe
        # "OLIVEIRA CLAUDIO BAIRRO" — a loja certa — no mesmo conjunto).
        # token_sort_ratio não tem esse viés, mas sozinho é rígido demais com
        # texto fora de ordem. A média dos dois pune a "ilusão de match
        # perfeito" sem perder as combinações válidas já testadas.
        set_ratio = fuzz.token_set_ratio(normalized_target, normalized_rede)
        sort_ratio = fuzz.token_sort_ratio(normalized_target, normalized_rede)
        score = (set_ratio + sort_ratio) / 2 / 100.0

        row_numbers = _extract_numbers(normalized_rede)
        if target_numbers and row_numbers and target_numbers.isdisjoint(row_numbers):
            score *= NUMBER_MISMATCH_PENALTY

        scored.append((row, score))
    # Desempate determinístico por row_number: a planilha real pode ter linhas
    # duplicadas (mesma loja lançada duas vezes por engano) — sem isso, qual
    # delas seria escolhida mudaria a cada sincronização.
    scored.sort(key=lambda pair: (-pair[1], pair[0].row_number))

    if not scored:
        return StoreMatch(row=None, score=0.0, candidates=[])

    best_row, best_score = scored[0]
    if best_score < MATCH_CONFIDENCE_THRESHOLD:
        return StoreMatch(row=None, score=best_score, candidates=scored[:5])

    # Dois candidatos quase empatados no topo não é confiança de verdade —
    # é a ordenação decidindo por sorte. Mais seguro pedir revisão humana
    # do que arriscar gravar visita na loja errada.
    if len(scored) >= 2 and (best_score - scored[1][1]) < AMBIGUITY_MARGIN:
        return StoreMatch(row=None, score=best_score, candidates=scored[:5])

    return StoreMatch(row=best_row, score=best_score, candidates=scored[:5])
