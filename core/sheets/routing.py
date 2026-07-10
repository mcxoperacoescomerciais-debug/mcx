"""Roteamento de gravação para múltiplas abas dentro do mesmo grupo/projeto.

Alguns grupos do WhatsApp reúnem promotores de responsáveis diferentes, e
cada responsável tem sua própria aba na planilha. Ex.: o grupo "Reposição MG
Barão" alimenta por padrão a aba "Barão", mas visitas da Marcília vão para
"Marcilia Div" e da Patricia para "Patricia Barão" — configurado em
sheets.promoter_routing no YAML do projeto.
"""
from __future__ import annotations

from core.common.text import normalize_text


def resolve_target_worksheet(
    candidates: list[str | None],
    routing: dict[str, str],
    default_worksheet: str,
) -> str:
    """Escolhe a aba de destino a partir dos textos disponíveis que possam
    identificar o promotor (nome do WhatsApp, identificador/telefone, nome
    extraído na extração). Compara por substring, sem acento e sem
    diferenciar maiúsculas/minúsculas — cai no padrão se nada bater."""
    normalized_candidates = [normalize_text(c) for c in candidates if c]

    for keyword, worksheet_name in routing.items():
        normalized_keyword = normalize_text(keyword)
        if any(normalized_keyword in candidate for candidate in normalized_candidates):
            return worksheet_name

    return default_worksheet
