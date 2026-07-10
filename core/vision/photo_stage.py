"""Classifica se uma foto é do "antes" ou do "depois" de uma execução.

Regra de negócio: o promotor deve informar na legenda se a foto é antes ou
depois. Só a foto de "depois" conta como a visita — a de "antes" é
ignorada no lançamento (não escreve dia nenhum na planilha).

Cobre tanto o texto livre que o promotor digita ("antes"/"depois") quanto o
campo já existente nas mensagens do Sistema GIV
(ex.: "Campo: Foto (pos execucao/planograma ok)").

Na ausência de qualquer marcação (a maioria das fotos hoje, antes dessa
regra existir), o padrão é tratar como "depois" — não vamos descartar
visitas antigas que nunca tiveram esse rótulo.
"""
from __future__ import annotations

import re

ANTES_PATTERN = re.compile(r"\b(antes|pr[ée][\s\-]?execu[cç][aã]o)\b", re.IGNORECASE)
DEPOIS_PATTERN = re.compile(r"\b(depois|p[óo]s[\s\-]?execu[cç][aã]o)\b", re.IGNORECASE)


def classify_stage(caption: str | None) -> str:
    """Retorna "antes", "depois" ou "indefinido" (tratado como depois)."""
    if not caption:
        return "indefinido"

    has_antes = bool(ANTES_PATTERN.search(caption))
    has_depois = bool(DEPOIS_PATTERN.search(caption))

    if has_antes and not has_depois:
        return "antes"
    if has_depois:
        return "depois"
    return "indefinido"


def is_before_photo(caption: str | None) -> bool:
    """True apenas quando a legenda diz explicitamente que é a foto do 'antes'."""
    return classify_stage(caption) == "antes"


# Legenda no formato "<nome da loja> antes/depois" (loja primeiro) ou
# "antes/depois <nome da loja>" (marcação primeiro) — o promotor usa os dois
# jeitos. O nome da loja é opcional — às vezes é só "Depois" sozinho.
_STORE_SUFFIX_RE = re.compile(r"^(.*?)\s*\b(antes|depois)\b[\.\!\?]*\s*$", re.IGNORECASE)
_STORE_PREFIX_RE = re.compile(r"^\s*(antes|depois)\b[\s:\-]*(.*)$", re.IGNORECASE)

# Depois do nome da loja, o promotor às vezes emenda um comentário livre na
# mesma linha (ex.: "Depois Rena Carmopolis. trabalhando com o que temos...").
# Sem cortar nesse ponto, o comentário inteiro vira "nome da loja" e a
# comparação com a planilha nunca bate (cai em revisão manual à toa).
_SENTENCE_BREAK_RE = re.compile(r"[.!?…]")


def _truncate_at_sentence_break(text: str) -> str:
    match = _SENTENCE_BREAK_RE.search(text)
    return (text[: match.start()] if match else text).strip()


def strip_sender_prefix(text: str, sender_name: str | None, sender_phone: str | None) -> str:
    """O texto capturado do WhatsApp às vezes vem com o nome/telefone do
    remetente como primeiras linhas, antes da legenda de verdade — remove
    isso para sobrar só o que a pessoa escreveu."""
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    while lines:
        first = lines[0]
        if sender_name and first == sender_name:
            lines.pop(0)
            continue
        if sender_phone and first == sender_phone:
            lines.pop(0)
            continue
        if re.match(r"^\+?\d[\d\s\-]{6,}$", first):
            lines.pop(0)
            continue
        break
    return "\n".join(lines)


def parse_store_and_stage(
    caption: str | None,
    sender_name: str | None = None,
    sender_phone: str | None = None,
) -> tuple[str | None, str]:
    """Extrai (nome_da_loja_ou_None, estagio) de legendas como
    "Oliveira gumercinda antes" ou só "Depois". Usado quando o promotor
    escreve o nome da loja direto na legenda em vez de vir pelo Sistema GIV.
    """
    if not caption:
        return None, "indefinido"

    body = strip_sender_prefix(caption, sender_name, sender_phone)
    if not body:
        return None, "indefinido"

    first_line = body.split("\n", 1)[0].strip()

    match = _STORE_SUFFIX_RE.match(first_line)
    if match:
        store_part = _truncate_at_sentence_break(match.group(1)).strip(" -:–—")
        stage = match.group(2).lower()
        return (store_part or None), stage

    match = _STORE_PREFIX_RE.match(first_line)
    if match:
        stage = match.group(1).lower()
        store_part = _truncate_at_sentence_break(match.group(2)).strip(" -:–—")
        return (store_part or None), stage

    return None, classify_stage(caption)
