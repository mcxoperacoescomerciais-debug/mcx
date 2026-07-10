"""Resolve uma mensagem coletada em (loja, cidade, promotor, data), decidindo
qual caminho de extração usar.

Prioridade:
1. Texto estruturado do Sistema GIV (core/vision/giv_parser.py) — mais barato
   e mais confiável, usado sempre que a legenda tiver esse formato.
2. Legenda no formato "<loja> antes/depois" digitada pelo promotor
   (core/vision/photo_stage.parse_store_and_stage) — a loja já vem escrita,
   não precisa de IA pra adivinhar a partir da imagem.
3. OCR + Vision AI na imagem, para fotos soltas sem nenhum desses padrões.

A escolha da loja definitiva (comparando com as linhas reais da planilha)
não acontece aqui — isso é responsabilidade do store_matcher (Fase 3). Este
módulo só extrai o melhor texto/sinal possível a partir da mensagem.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from pathlib import Path

from core.db.models import ProcessedMessage
from core.vision import ocr
from core.vision.ai_vision import VisionNotConfiguredError, analyze_image
from core.vision.giv_parser import parse_giv_caption
from core.vision.photo_stage import parse_store_and_stage

# Confiança alta por ser o próprio promotor escrevendo o nome da loja —
# não é um palpite de IA sobre a imagem.
CAPTION_STORE_CONFIDENCE = 0.9


@dataclass
class ResolvedExtraction:
    source: str  # giv_structured | vision_ai | needs_review | ignored_no_photo | ignored_before_photo
    store_candidates: list[str] = field(default_factory=list)
    city_text: str | None = None
    promoter_text: str | None = None
    visit_datetime: dt.datetime | None = None
    date_source: str | None = None  # giv_field | message_timestamp | image_text
    confidence: float = 0.0
    ocr_text: str | None = None
    ai_raw_response: str | None = None
    review_reason: str | None = None


def _parse_br_date(text: str) -> dt.datetime | None:
    try:
        day, month, year = text.strip().split("/")
        return dt.datetime(int(year), int(month), int(day))
    except (ValueError, AttributeError):
        return None


def resolve_text_signals(message: ProcessedMessage) -> ResolvedExtraction:
    """Extrai o que der só a partir de texto (legenda), sem chamar Vision AI.

    Quando a foto realmente precisa de Vision AI para ser lida, volta com
    source="needs_vision" — quem chama decide se e quando completar com
    resolve_with_vision(). Isso existe pra dar prioridade ao texto: se a
    legenda sozinha já bate com uma loja real (checado depois, em
    core/pipeline/extraction.py._apply_caption_text_match), não faz sentido
    gastar uma chamada de Vision AI nem arriscar que ela "vença a corrida"
    com um palpite errado sobre a imagem.
    """
    # Padrões de texto (GIV, "loja antes/depois") valem mesmo sem foto — um
    # promotor pode escrever "Abc 77 Cláudio zerado" sem anexar imagem, e se
    # "Abc 77" for uma loja de verdade, isso conta como atendimento.
    store_from_caption, stage = parse_store_and_stage(
        message.caption, message.sender_name, message.sender_phone
    )
    if stage == "antes":
        return ResolvedExtraction(source="ignored_before_photo")

    giv = parse_giv_caption(message.caption)
    if giv is not None:
        return ResolvedExtraction(
            source="giv_structured",
            store_candidates=[giv.store_text],
            city_text=giv.city_text,
            promoter_text=giv.promoter_name,
            visit_datetime=giv.visit_datetime,
            date_source="giv_field",
            confidence=giv.confidence,
        )

    if store_from_caption:
        return ResolvedExtraction(
            source="caption_store_stage",
            store_candidates=[store_from_caption],
            promoter_text=message.sender_name or None,
            visit_datetime=message.message_timestamp,
            date_source="message_timestamp" if message.message_timestamp else None,
            confidence=CAPTION_STORE_CONFIDENCE,
            review_reason=None if message.message_timestamp else "no_date_found",
        )

    if not message.media_path:
        # Sem foto e sem nenhum padrão reconhecido ainda. Não é ignorada de
        # cara: core/pipeline/extraction.py ainda vai comparar o texto (se
        # houver) contra as lojas conhecidas e contra aliases já aprendidos.
        # Só vira "ignorada" de vez se nada disso achar uma loja — aí sim é
        # só um comentário no grupo, não uma visita.
        return ResolvedExtraction(
            source="text_only_no_signal",
            promoter_text=message.sender_name or None,
            visit_datetime=message.message_timestamp,
            date_source="message_timestamp" if message.message_timestamp else None,
        )

    return ResolvedExtraction(
        source="needs_vision",
        promoter_text=message.sender_name or None,
        visit_datetime=message.message_timestamp,
        date_source="message_timestamp" if message.message_timestamp else None,
    )


def resolve_with_vision(message: ProcessedMessage) -> ResolvedExtraction:
    """Completa com OCR + Vision AI uma mensagem que resolve_text_signals()
    não conseguiu resolver só com texto (source == "needs_vision")."""
    image_path = Path(message.media_path)
    ocr_text = ocr.extract_text(image_path)

    try:
        vision = analyze_image(image_path, message.caption, ocr_text)
    except VisionNotConfiguredError:
        return ResolvedExtraction(
            source="needs_review",
            promoter_text=message.sender_name or None,
            visit_datetime=message.message_timestamp,
            date_source="message_timestamp" if message.message_timestamp else None,
            ocr_text=ocr_text,
            review_reason="vision_not_configured",
        )
    except Exception:
        # Erros transitórios de API (rate limit, servidor sobrecarregado, rede
        # instável) não podem derrubar o lote inteiro — essa mensagem fica
        # pendente e uma próxima sincronização tenta de novo.
        return ResolvedExtraction(
            source="needs_review",
            promoter_text=message.sender_name or None,
            visit_datetime=message.message_timestamp,
            date_source="message_timestamp" if message.message_timestamp else None,
            ocr_text=ocr_text,
            review_reason="vision_api_error",
        )

    # Prioridade de data: timestamp da mensagem do WhatsApp é mais confiável
    # que uma data lida dentro da própria imagem.
    visit_datetime = message.message_timestamp
    date_source = "message_timestamp" if visit_datetime else None
    if visit_datetime is None and vision.date_text:
        parsed = _parse_br_date(vision.date_text)
        if parsed:
            visit_datetime, date_source = parsed, "image_text"

    return ResolvedExtraction(
        source="vision_ai",
        store_candidates=vision.store_candidates,
        city_text=vision.city,
        promoter_text=message.sender_name or None,
        visit_datetime=visit_datetime,
        date_source=date_source,
        confidence=vision.confidence,
        ocr_text=ocr_text,
        ai_raw_response=vision.raw_response,
        review_reason=None if visit_datetime else "no_date_found",
    )


def resolve(message: ProcessedMessage) -> ResolvedExtraction:
    """Atalho que roda as duas etapas em sequência (texto, depois Vision AI
    se precisar). Use resolve_text_signals()/resolve_with_vision() direto
    quando quiser dar uma chance ao texto contra dados reais (cache de
    lojas) antes de decidir se vale a pena chamar Vision AI."""
    resolved = resolve_text_signals(message)
    if resolved.source != "needs_vision":
        return resolved
    return resolve_with_vision(message)
