"""Estruturas de dados intermediárias do coletor do WhatsApp."""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field


@dataclass
class RawMessage:
    """Uma mensagem de foto lida do WhatsApp Web, antes de qualquer extração."""

    message_id: str  # data-id do WhatsApp, único e estável
    sender_name: str | None
    sender_phone: str | None
    message_timestamp: dt.datetime | None  # None se não foi possível determinar
    caption: str | None
    image_srcs: list[str] = field(default_factory=list)  # blob:/https: urls dentro da página
    # True para mensagens enviadas pela própria conta (a conta administrativa
    # usada para operar o WhatsApp Web, não um promotor de campo). Mensagens
    # assim nunca são relato de visita — ver core/whatsapp/collector.py.
    is_outgoing: bool = False
    # Hora "HH:MM" visível mesmo em mensagens sem legenda (sem data). Usada
    # para inferir a data por proximidade com mensagens vizinhas que têm
    # timestamp completo — ver core/whatsapp/collector.py:_fill_missing_dates.
    time_only: str | None = None
