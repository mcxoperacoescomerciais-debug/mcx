"""Aprendizado incremental a partir de correções manuais.

Quando o usuário confirma manualmente qual loja uma foto ambígua representa
(painel Streamlit), guardamos a associação texto -> loja. Da próxima vez que
o mesmo texto (legenda ou melhor palpite da Vision AI) aparecer, o sistema
reconhece sozinho — sem gastar uma chamada de IA nem repetir a mesma
pergunta pro usuário.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from core.common.text import normalize_text
from core.db.models import LearnedAlias


def learn_alias(session: Session, project: str, alias_text: str | None, rede: str) -> None:
    normalized = normalize_text(alias_text)
    if not normalized:
        return

    existing = session.execute(
        select(LearnedAlias).where(LearnedAlias.project == project, LearnedAlias.alias_text == normalized)
    ).scalar_one_or_none()

    if existing:
        existing.rede = rede  # a correção mais recente do usuário vale mais
    else:
        session.add(LearnedAlias(project=project, alias_text=normalized, rede=rede))


def find_learned_alias(session: Session, project: str, text: str | None) -> str | None:
    normalized = normalize_text(text)
    if not normalized:
        return None

    row = session.execute(
        select(LearnedAlias).where(LearnedAlias.project == project, LearnedAlias.alias_text == normalized)
    ).scalar_one_or_none()
    return row.rede if row else None
