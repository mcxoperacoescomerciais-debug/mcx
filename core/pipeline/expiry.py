"""Consultas de produtos em avaria/vencimento — projeto Suinco.

Não existe robô de notificação: o "aviso com 10 dias de antecedência" é só
uma consulta que filtra por data, refeita a cada vez que a página é aberta.
A aba pública Vencimentos (app/pages/2_⏰_Vencimentos.py) usa exatamente essa
consulta, e monta também uma mensagem curta pronta pra copiar e mandar no
WhatsApp do gerente, em vez de exigir que ele acesse o painel.

Este recurso é específico do projeto "Suinco" — não é um dos projetos de
acompanhamento de visita (core/config/projects/*.yaml), por isso a chave
fica fixa aqui em vez de vir de um YAML.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from core.db.models import DamagedProduct

DEFAULT_WARNING_DAYS = 10

AVARIA_PROJECT_KEY = "suinco"
AVARIA_PROJECT_LABEL = "Suinco"


@dataclass
class ExpiringProduct:
    id: int
    loja: str
    promotor: str
    produto: str
    quantidade: int | None
    tipo: str | None
    validade: dt.date | None
    observacao: str | None
    foto_path: str | None
    dias_restantes: int | None


def _to_view(row: DamagedProduct) -> ExpiringProduct:
    dias = (row.validade - dt.date.today()).days if row.validade else None
    return ExpiringProduct(
        id=row.id,
        loja=row.loja,
        promotor=row.promotor,
        produto=row.produto,
        quantidade=row.quantidade,
        tipo=row.tipo,
        validade=row.validade,
        observacao=row.observacao,
        foto_path=row.foto_path,
        dias_restantes=dias,
    )


def list_active_products(session: Session, project: str = AVARIA_PROJECT_KEY) -> list[ExpiringProduct]:
    """Todos os itens ativos (ainda não marcados como resolvidos), ordenado
    por validade ascendente (itens sem validade ficam por último)."""
    rows = session.execute(
        select(DamagedProduct)
        .where(DamagedProduct.project == project, DamagedProduct.status == "ativo")
        .order_by(DamagedProduct.validade.is_(None), DamagedProduct.validade.asc())
    ).scalars().all()
    return [_to_view(r) for r in rows]


def list_expiring_soon(
    session: Session, project: str = AVARIA_PROJECT_KEY, warning_days: int = DEFAULT_WARNING_DAYS
) -> list[ExpiringProduct]:
    """Itens ativos com validade preenchida, já vencidos ou vencendo dentro de
    `warning_days` dias — a própria lista já é o aviso."""
    limit_date = dt.date.today() + dt.timedelta(days=warning_days)
    rows = session.execute(
        select(DamagedProduct)
        .where(
            DamagedProduct.project == project,
            DamagedProduct.status == "ativo",
            DamagedProduct.validade.isnot(None),
            DamagedProduct.validade <= limit_date,
        )
        .order_by(DamagedProduct.validade.asc())
    ).scalars().all()
    return [_to_view(r) for r in rows]


def build_whatsapp_message(items: list[ExpiringProduct], project_label: str = AVARIA_PROJECT_LABEL) -> str:
    """Mensagem curta e resumida para copiar e colar no WhatsApp do gerente —
    de propósito bem mais enxuta que a tabela do painel, pra não confundir."""
    if not items:
        return f"✅ {project_label}: nenhum produto vencendo nos próximos dias."

    lines = [f"⏰ Aviso de vencimento — {project_label}", ""]
    for i, item in enumerate(items, start=1):
        validade_str = item.validade.strftime("%d/%m/%Y") if item.validade else "sem data"
        if item.dias_restantes is not None and item.dias_restantes < 0:
            situacao = f"VENCIDO há {abs(item.dias_restantes)} dia(s)"
        elif item.dias_restantes is not None:
            situacao = f"vence em {item.dias_restantes} dia(s)"
        else:
            situacao = "sem data de validade"
        lines.append(f"{i}. {item.produto} — {item.loja} — {situacao} ({validade_str})")

    lines.append("")
    lines.append("Por favor, verificar e providenciar a retirada/troca desses itens.")
    return "\n".join(lines)
