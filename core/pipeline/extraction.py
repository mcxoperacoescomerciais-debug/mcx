"""Liga o resolver (Fase 2) à persistência: grava o resultado da extração e
decide se a mensagem está pronta para ir à planilha ou precisa de revisão
humana.

Também faz a "herança de contexto": promotores costumam mandar várias fotos
seguidas da mesma visita e só escrever o nome da loja em uma delas (nem
sempre a primeira). Sem isso, cada foto seria julgada isoladamente e a
maioria delas cairia em revisão manual à toa, mesmo quando o nome da loja já
está escrito bem ali do lado, em outra mensagem da mesma sequência.
"""
from __future__ import annotations

import datetime as dt
import re
from dataclasses import replace

from sqlalchemy import select
from sqlalchemy.orm import Session

from core.common.text import normalize_text
from core.config.settings import load_project_config, settings
from core.db.models import ExtractionResult, PendingReview, ProcessedMessage, StoreCache
from core.sheets.calendar_utils import format_mes_ano
from core.sheets.routing import resolve_target_worksheet
from core.sheets.store_matcher import StoreRow, find_match
from core.pipeline.learning import find_learned_alias
from core.vision.photo_stage import strip_sender_prefix
from core.vision.resolver import ResolvedExtraction, resolve_text_signals, resolve_with_vision

# Mensagens do mesmo remetente com menos que isso de intervalo entre uma e a
# outra são tratadas como fotos da mesma visita (mesma loja).
CLUSTER_GAP = dt.timedelta(minutes=30)

# Comentários de chat sem nenhuma loja mencionada ("Ok", "Pediu pra lembrar
# semana que vem") sempre acham "o melhor dos piores" contra qualquer lista
# de lojas — mas com nota bem baixa. Abaixo disso, não é candidato
# plausível, é só texto que não fala de loja nenhuma.
MIN_PLAUSIBLE_SCORE = 0.45

# O score fuzzy sozinho não é confiável nessa faixa: frases de chat comuns
# ("Mi envia o contato dele", "Consegue sim, muito obrigada") batem por
# coincidência de caracteres contra ALGUMA loja do universo de comparação
# com nota parecida à de menções reais parciais ("ABC-Porto Velho" contra
# "SOMAR PORTO VELHO"). O que realmente distingue as duas situações é se
# pelo menos uma palavra de peso (não genérica) aparece literalmente nos
# dois lados — por isso a exigência abaixo, além do piso de score.
_GENERIC_WORDS = {
    "SUPER", "SUPERMERCADO", "MERCADO", "MERCEARIA", "LOJA", "LOJAS", "REDE",
    "PARA", "COMO", "ESSA", "ESSE", "ISSO", "MUITO", "TUDO", "TODO", "TODA",
    "TODOS", "TODAS", "MAIS", "MENOS", "AGORA", "OBRIGADO", "OBRIGADA",
    "FAVOR", "MANDA", "MANDAR", "ENVIA", "ENVIAR", "AINDA", "BOM", "BOA",
    "DIA", "DIAS", "TARDE", "NOITE", "MES", "MESES", "ANO", "ANOS",
    "CONTATO", "VOCE", "PESSOAL", "GALERA",
}


def _shares_meaningful_word(body_normalized: str, rede_normalized: str) -> bool:
    body_words = {w for w in body_normalized.split() if len(w) >= 3 and w not in _GENERIC_WORDS}
    rede_words = {w for w in rede_normalized.split() if len(w) >= 3 and w not in _GENERIC_WORDS}
    return bool(body_words & rede_words)

CONFIDENT_SOURCES = (
    "giv_structured",
    "caption_store_stage",
    "caption_text_match",
    "cluster_inherited",
    "learned_alias",
)


def _is_confident(resolved: ResolvedExtraction) -> bool:
    return resolved.source in CONFIDENT_SOURCES or (
        resolved.source == "vision_ai" and resolved.confidence >= settings.confidence_threshold
    )


# "sender_phone" às vezes vem preenchido com um identificador que não é um
# telefone de verdade (ex.: nome de uma conta de encaminhamento/admin do
# grupo) — se dois remetentes diferentes caírem nesse mesmo identificador
# por acaso, tratar isso como "mesmo remetente" agruparia visitas de
# promotores diferentes. Só confia em sender_phone quando tem cara de
# telefone; caso contrário usa o nome de exibição.
_PHONE_LIKE_RE = re.compile(r"^\+?\d[\d\s\-]{6,}$")


def _cluster_key(message: ProcessedMessage) -> str:
    if message.sender_phone and _PHONE_LIKE_RE.match(message.sender_phone.strip()):
        return message.sender_phone
    if message.sender_name:
        return message.sender_name
    return f"__msg_{message.id}"


def _apply_cluster_inheritance(
    messages: list[ProcessedMessage],
    resolved_by_id: dict[int, ResolvedExtraction],
) -> None:
    groups: dict[str, list[ProcessedMessage]] = {}
    for message in messages:
        resolved = resolved_by_id[message.id]
        if resolved.source.startswith("ignored"):
            continue
        groups.setdefault(_cluster_key(message), []).append(message)

    for group_messages in groups.values():
        with_timestamp = sorted(
            (m for m in group_messages if m.message_timestamp is not None),
            key=lambda m: m.message_timestamp,
        )

        clusters: list[list[ProcessedMessage]] = []
        for message in with_timestamp:
            if clusters and (message.message_timestamp - clusters[-1][-1].message_timestamp) <= CLUSTER_GAP:
                clusters[-1].append(message)
            else:
                clusters.append([message])

        for cluster in clusters:
            if len(cluster) < 2:
                continue

            confident_members = [m for m in cluster if _is_confident(resolved_by_id[m.id])]
            distinct_stores = {
                normalize_text(resolved_by_id[m.id].store_candidates[0])
                for m in confident_members
                if resolved_by_id[m.id].store_candidates
            }
            if len(distinct_stores) != 1:
                # Sem loja confiável no grupo, ou mais de uma loja diferente
                # (não é a mesma visita, ou é ambíguo demais) — não arrisca.
                continue

            anchor = next(
                resolved_by_id[m.id]
                for m in confident_members
                if resolved_by_id[m.id].store_candidates
                and normalize_text(resolved_by_id[m.id].store_candidates[0]) == next(iter(distinct_stores))
            )

            for message in cluster:
                resolved = resolved_by_id[message.id]
                if _is_confident(resolved):
                    continue
                resolved_by_id[message.id] = replace(
                    resolved,
                    source="cluster_inherited",
                    store_candidates=anchor.store_candidates,
                    city_text=anchor.city_text or resolved.city_text,
                    confidence=anchor.confidence,
                    review_reason=None,
                )


def _apply_learned_aliases(
    session: Session,
    project: str,
    messages: list[ProcessedMessage],
    resolved_by_id: dict[int, ResolvedExtraction],
) -> None:
    """Confere se a legenda (ou o melhor palpite que a Vision AI já deu)
    bate com algo que um humano já confirmou antes no painel. Roda antes de
    qualquer outra tentativa — é o sinal mais confiável que existe, porque
    veio de uma correção manual de verdade."""
    for message in messages:
        resolved = resolved_by_id[message.id]
        if resolved.source.startswith("ignored") or _is_confident(resolved):
            continue

        candidate_texts = []
        if message.caption:
            body = strip_sender_prefix(message.caption, message.sender_name, message.sender_phone)
            if body:
                candidate_texts.append(body)
        candidate_texts.extend(resolved.store_candidates)

        rede = None
        for text in candidate_texts:
            rede = find_learned_alias(session, project, text)
            if rede:
                break
        if not rede:
            continue

        resolved_by_id[message.id] = replace(
            resolved,
            source="learned_alias",
            store_candidates=[rede],
            confidence=1.0,
            visit_datetime=resolved.visit_datetime or message.message_timestamp,
            date_source=resolved.date_source or ("message_timestamp" if message.message_timestamp else None),
            review_reason=None,
        )


def _extract_city_hint(body: str, cache_rows: list) -> str | None:
    """Procura, na legenda, o nome de uma cidade real já conhecida da
    planilha (mesma aba/mês). Se mais de uma cidade aparecer no texto —
    caso real: "Supermercado oliveira Cláudio mg", onde "Oliveira" é ao
    mesmo tempo início do nome da loja E o nome de outra cidade — prefere a
    que aparece mais à direita no texto, seguindo o padrão de endereço
    brasileiro "[loja] [cidade] [estado]"."""
    normalized_body = normalize_text(body)
    position_by_city: dict[str, int] = {}
    display_by_city: dict[str, str] = {}

    for row in cache_rows:
        if not row.cidade:
            continue
        normalized_city = normalize_text(row.cidade)
        if normalized_city in position_by_city:
            continue
        match = re.search(rf"\b{re.escape(normalized_city)}\b", normalized_body)
        if match:
            position_by_city[normalized_city] = match.start()
            display_by_city[normalized_city] = row.cidade

    if not position_by_city:
        return None

    best = max(position_by_city, key=position_by_city.get)
    return display_by_city[best]


def _apply_caption_text_match(
    session: Session,
    project: str,
    project_config: dict,
    messages: list[ProcessedMessage],
    resolved_by_id: dict[int, ResolvedExtraction],
) -> None:
    """Quando a legenda não bate com o Sistema GIV nem com o padrão
    "loja antes/depois", mas ainda assim tem texto (ex.: "Panelao Loja 7
    Melo Cancado"), tenta casar esse texto direto contra as lojas reais já
    conhecidas da planilha (cache de uma sincronização anterior) — evita
    depender só da Vision AI quando o promotor já escreveu o nome da loja.
    """
    routing = project_config["sheets"].get("promoter_routing", {})
    default_worksheet = project_config["sheets"]["worksheet_name"]
    month_abbrevs = project_config["sheets"]["month_abbreviations"]

    for message in messages:
        resolved = resolved_by_id[message.id]
        if resolved.source.startswith("ignored") or _is_confident(resolved):
            continue
        if not message.caption:
            continue

        body = strip_sender_prefix(message.caption, message.sender_name, message.sender_phone)
        if not body:
            continue

        reference_date = resolved.visit_datetime or message.message_timestamp
        if reference_date is None:
            continue

        target_worksheet = resolve_target_worksheet(
            [message.sender_name, message.sender_phone], routing, default_worksheet
        )
        mes_ano = format_mes_ano(reference_date.date(), month_abbrevs)

        cache_rows = session.execute(
            select(StoreCache).where(
                StoreCache.project == project,
                StoreCache.worksheet_name == target_worksheet,
                StoreCache.mes_ano == mes_ano,
            )
        ).scalars().all()
        if not cache_rows:
            continue

        store_rows = [
            StoreRow(row_number=r.row_number, rede=r.rede, marca=r.marca, cidade=r.cidade, mes_ano=r.mes_ano)
            for r in cache_rows
        ]
        city_hint = _extract_city_hint(body, cache_rows)
        match = find_match(store_rows, body, mes_ano, city_hint)
        if match.row is not None:
            resolved_by_id[message.id] = replace(
                resolved,
                source="caption_text_match",
                store_candidates=[match.row.rede],
                city_text=match.row.cidade,
                confidence=match.score,
                visit_datetime=reference_date,
                date_source=resolved.date_source or ("message_timestamp" if message.message_timestamp else None),
                review_reason=None,
            )
        elif (
            match.candidates
            and match.candidates[0][1] >= MIN_PLAUSIBLE_SCORE
            and _shares_meaningful_word(normalize_text(body), normalize_text(match.candidates[0][0].rede))
        ):
            # Texto bateu com mais de uma loja plausível (ou nenhuma com
            # confiança suficiente, mas ainda assim parecida) — melhor
            # mostrar os candidatos pro usuário escolher do que arriscar a
            # Vision AI "resolver" a ambiguidade com um palpite não
            # confiável sobre a imagem.
            #
            # Quando nem o melhor candidato chega perto (abaixo de
            # MIN_PLAUSIBLE_SCORE) OU quando o score só é parecido por
            # coincidência de caracteres sem nenhuma palavra de peso em
            # comum (ex.: "Mi envia o contato dele"), a legenda provavelmente
            # não menciona loja nenhuma — é só um comentário no grupo. Nesse
            # caso não sugere nada; a mensagem segue sem sinal de texto e é
            # ignorada mais adiante se também não tiver foto.
            resolved_by_id[message.id] = replace(
                resolved,
                source="needs_review",
                store_candidates=[c[0].rede for c in match.candidates],
                confidence=match.score,
                visit_datetime=reference_date,
                date_source=resolved.date_source or ("message_timestamp" if message.message_timestamp else None),
                review_reason="ambiguous_store",
            )


def persist_resolution(session: Session, message: ProcessedMessage, resolved: ResolvedExtraction) -> None:
    if resolved.source.startswith("ignored") or resolved.source == "text_only_no_signal":
        # ignored_before_photo: foto do "antes" — só a de "depois" conta.
        # text_only_no_signal: mensagem sem foto e sem nenhuma loja
        #   reconhecida no texto, mesmo depois de comparar com lojas
        #   conhecidas e aliases aprendidos — é só um comentário no grupo,
        #   não uma visita.
        # Em nenhum dos casos é erro ou precisa de revisão humana.
        message.status = "ignored"
        return

    chosen_store = resolved.store_candidates[0] if resolved.store_candidates else None

    session.add(
        ExtractionResult(
            message_id=message.id,
            ocr_text=resolved.ocr_text,
            ai_raw_response=resolved.ai_raw_response,
            store_candidates=[{"rede_texto": s} for s in resolved.store_candidates],
            chosen_store=chosen_store,
            store_confidence=resolved.confidence,
            city_text=resolved.city_text,
            chosen_date=resolved.visit_datetime.date() if resolved.visit_datetime else None,
            date_source=resolved.date_source,
            promoter_raw=resolved.promoter_text,
        )
    )

    has_minimum_data = bool(chosen_store) and resolved.visit_datetime is not None

    if _is_confident(resolved) and has_minimum_data:
        message.status = "processed"
    else:
        message.status = "needs_review"
        session.add(
            PendingReview(
                message_id=message.id,
                reason=resolved.review_reason or "low_confidence",
                candidates={
                    "store_candidates": resolved.store_candidates,
                    "city_text": resolved.city_text,
                    "promoter_text": resolved.promoter_text,
                    "confidence": resolved.confidence,
                    "visit_datetime": resolved.visit_datetime.isoformat()
                    if resolved.visit_datetime
                    else None,
                },
            )
        )


def extract_pending_messages(session: Session, project: str) -> dict[str, int]:
    """Resolve e persiste todas as mensagens do projeto que ainda não têm
    resultado de extração. Usado pelo script de CLI e pelo painel — a query
    fica só aqui para não duplicar (e não esquecer o filtro de projeto, que
    já foi motivo de bug: sem ele, sincronizar um projeto processava
    mensagens de outros projetos juntos)."""
    already_done = select(ExtractionResult.message_id)
    pending = (
        session.execute(
            select(ProcessedMessage).where(
                ProcessedMessage.project == project,
                ~ProcessedMessage.id.in_(already_done),
            )
        )
        .scalars()
        .all()
    )

    project_config = load_project_config(project)

    # Fase 1: só texto (sem Vision AI). Se a legenda sozinha já bate com uma
    # loja real do cache (_apply_caption_text_match) ou um alias já
    # confirmado por humano antes (_apply_learned_aliases), a mensagem já
    # sai resolvida sem gastar Vision AI nem correr o risco dela "ganhar a
    # corrida" com um palpite errado sobre a imagem.
    resolved_by_id = {message.id: resolve_text_signals(message) for message in pending}
    _apply_learned_aliases(session, project, pending, resolved_by_id)
    _apply_caption_text_match(session, project, project_config, pending, resolved_by_id)

    # Fase 2: só quem ainda não tem nenhum sinal de texto confiável (ou não
    # tinha legenda pra começo de conversa) precisa mesmo de Vision AI.
    for message in pending:
        if resolved_by_id[message.id].source == "needs_vision":
            resolved_by_id[message.id] = resolve_with_vision(message)

    _apply_cluster_inheritance(pending, resolved_by_id)

    counts: dict[str, int] = {}
    for message in pending:
        persist_resolution(session, message, resolved_by_id[message.id])
        counts[message.status] = counts.get(message.status, 0) + 1
    return counts
