"""Normalização de texto compartilhada (sem acento, maiúsculas, espaços
colapsados) — usada para comparar nomes de loja/promotor vindos de fontes
diferentes (planilha, WhatsApp, IA)."""
from __future__ import annotations

import unicodedata


def normalize_text(text: str | None) -> str:
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return " ".join(text.upper().split())
