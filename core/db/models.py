"""Modelos SQLite (SQLAlchemy) do MCX Tracker.

O SQLite é a fonte de verdade operacional (mensagens processadas, pendências
de revisão humana e histórico de auditoria). A planilha Google Sheets é só
o destino final dos dados já resolvidos.
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class ProcessedMessage(Base):
    """Uma mensagem de foto recebida no grupo do WhatsApp.

    A unicidade de `message_id` (mais `media_hash` como rede de segurança
    para fotos reencaminhadas) é o que impede lançar a mesma visita duas vezes.
    """

    __tablename__ = "processed_messages"
    __table_args__ = (UniqueConstraint("project", "message_id", name="uq_project_message"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project: Mapped[str] = mapped_column(String(50), index=True)  # ex.: "cafe"
    message_id: Mapped[str] = mapped_column(String(255), index=True)
    media_hash: Mapped[str] = mapped_column(String(64), index=True)  # sha256 da imagem
    media_path: Mapped[str] = mapped_column(String(500))

    chat_group: Mapped[str] = mapped_column(String(255))
    sender_name: Mapped[str] = mapped_column(String(255))
    sender_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    caption: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # Pode ser nulo quando a mensagem não tem legenda e não foi possível
    # extrair o metadado de data do WhatsApp (data-pre-plain-text). Nesse
    # caso o status vira "needs_review" em vez de inventar uma data.
    message_timestamp: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="pending")
    # pending | processed | written | needs_review | error | duplicate | ignored
    # (ignored = foto do "antes", não conta como visita)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    extraction: Mapped["ExtractionResult | None"] = relationship(back_populates="message", uselist=False)
    pending_review: Mapped["PendingReview | None"] = relationship(back_populates="message", uselist=False)


class ExtractionResult(Base):
    """Resultado da extração (OCR + Vision AI) para uma mensagem."""

    __tablename__ = "extraction_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("processed_messages.id"), unique=True)

    ocr_text: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    ai_raw_response: Mapped[str | None] = mapped_column(String(4000), nullable=True)

    store_candidates: Mapped[list] = mapped_column(JSON, default=list)
    # [{"rede": "...", "cidade": "...", "score": 0.0-1.0}, ...] ordenado por score desc

    chosen_store: Mapped[str | None] = mapped_column(String(255), nullable=True)
    store_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    city_text: Mapped[str | None] = mapped_column(String(255), nullable=True)

    date_candidates: Mapped[list] = mapped_column(JSON, default=list)
    chosen_date: Mapped[dt.date | None] = mapped_column(nullable=True)
    date_source: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # message_timestamp | caption | image_text | exif

    promoter_raw: Mapped[str | None] = mapped_column(String(255), nullable=True)
    promoter_resolved: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    message: Mapped["ProcessedMessage"] = relationship(back_populates="extraction")


class PendingReview(Base):
    """Fila de revisão humana (Streamlit) para casos ambíguos ou de baixa confiança."""

    __tablename__ = "pending_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("processed_messages.id"), unique=True)

    reason: Mapped[str] = mapped_column(String(50))
    # low_confidence | ambiguous_store | ambiguous_date | row_not_found | unknown_promoter

    candidates: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | resolved | ignored

    resolved_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resolved_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    message: Mapped["ProcessedMessage"] = relationship(back_populates="pending_review")


class AuditLog(Base):
    """Histórico de toda alteração feita na planilha (o que a regra de negócio pede)."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project: Mapped[str] = mapped_column(String(50), index=True)

    timestamp: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    loja: Mapped[str] = mapped_column(String(255))
    promotor: Mapped[str] = mapped_column(String(255))
    dia: Mapped[int] = mapped_column(Integer)
    semana_coluna: Mapped[str] = mapped_column(String(30))  # ex.: "2º SEM"
    mes_ano: Mapped[str] = mapped_column(String(10))  # ex.: "JUL/2026"

    valor_anterior: Mapped[str | None] = mapped_column(String(255), nullable=True)
    valor_novo: Mapped[str] = mapped_column(String(255))

    message_id: Mapped[int | None] = mapped_column(ForeignKey("processed_messages.id"), nullable=True)
    source: Mapped[str] = mapped_column(String(10), default="auto")  # auto | manual


class StoreCache(Base):
    """Cache local das linhas da planilha (REDE/MARCA/CIDADE/MÊS-ANO -> nº da linha).

    Evita reler a aba inteira a cada foto processada.
    """

    __tablename__ = "store_cache"
    # Sem UniqueConstraint de propósito: a planilha real pode ter linhas
    # duplicadas por erro de preparação (já vimos um caso real de copiar/colar
    # a mesma loja duas vezes). O cache reflete a planilha como ela é —
    # quem desempata é o store_matcher (menor row_number em caso de empate).

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project: Mapped[str] = mapped_column(String(50), index=True)
    # Nome da aba de onde essa linha veio. Um projeto pode gravar em mais de
    # uma aba (roteamento por promotor, ver core/sheets/routing.py) — sem
    # isso, linhas de abas diferentes com o mesmo REDE/MÊS-ANO se confundiriam.
    worksheet_name: Mapped[str] = mapped_column(String(255), index=True)

    rede: Mapped[str] = mapped_column(String(255), index=True)
    marca: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cidade: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mes_ano: Mapped[str] = mapped_column(String(10), index=True)

    row_number: Mapped[int] = mapped_column(Integer)
    last_synced_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PromoterMap(Base):
    """De-para entre o contato do WhatsApp e o nome usado na coluna PROMO da planilha."""

    __tablename__ = "promoter_map"
    __table_args__ = (UniqueConstraint("project", "whatsapp_phone", name="uq_project_phone"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project: Mapped[str] = mapped_column(String(50), index=True)

    whatsapp_name: Mapped[str] = mapped_column(String(255))
    whatsapp_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    promo_name: Mapped[str] = mapped_column(String(255))

    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DamagedProduct(Base):
    """Produto em avaria ou próximo do vencimento, registrado por um promotor
    no painel (aba Avarias). É a base do aviso de vencimento: a aba pública
    Vencimentos lê esta tabela e mostra, sem robô nem agendador nenhum, tudo
    que está a até N dias (padrão 10, ver core/pipeline/expiry.py) de vencer.

    Hoje usada só pelo projeto "Suinco" (chave fixa em
    core/pipeline/expiry.py, não um YAML em core/config/projects/ como os
    projetos de acompanhamento de visita) — por isso o campo `project` aqui
    não precisa bater com nenhum arquivo de config.
    """

    __tablename__ = "damaged_products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project: Mapped[str] = mapped_column(String(50), index=True)

    loja: Mapped[str] = mapped_column(String(255))
    promotor: Mapped[str] = mapped_column(String(255))

    produto: Mapped[str] = mapped_column(String(255))
    quantidade: Mapped[int | None] = mapped_column(Integer, nullable=True)

    tipo: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # motivo digitado livremente (ex.: "Vencimento próximo", "Avariado")
    validade: Mapped[dt.date | None] = mapped_column(nullable=True)
    observacao: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    foto_paths: Mapped[list] = mapped_column(JSON, default=list)  # lista de caminhos, pode ter varias fotos

    status: Mapped[str] = mapped_column(String(20), default="ativo")  # ativo | resolvido

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    resolved_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(String(255), nullable=True)


class LearnedAlias(Base):
    """Memória de correções manuais: texto (legenda ou melhor palpite da
    Vision AI) -> loja confirmada por um humano no painel. Da próxima vez
    que o mesmo texto aparecer, o sistema já reconhece sozinho, sem precisar
    perguntar de novo nem gastar uma chamada de Vision AI."""

    __tablename__ = "learned_aliases"
    __table_args__ = (UniqueConstraint("project", "alias_text", name="uq_project_alias"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project: Mapped[str] = mapped_column(String(50), index=True)

    alias_text: Mapped[str] = mapped_column(String(500), index=True)  # já normalizado
    rede: Mapped[str] = mapped_column(String(255))

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
