"""Painel MCX Tracker — projeto Café.

Uso:
    streamlit run app/main.py
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

# Garante que "core" seja importável mesmo se o Streamlit for iniciado com
# outro diretório de trabalho.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import streamlit as st
from sqlalchemy import select

from core.config.settings import list_projects, load_project_config
from core.db.models import AuditLog, ExtractionResult, PendingReview, ProcessedMessage, StoreCache
from core.pipeline.runner import run_full_pipeline
from core.pipeline.stats import get_dashboard_stats
from core.pipeline.sync_state import get_last_sync
from core.db.session import get_session
from core.pipeline.learning import learn_alias
from core.sheets.calendar_utils import format_mes_ano
from core.sheets.routing import resolve_target_worksheet
from core.sheets.writer import write_visit_day
from core.sheets.client import get_worksheet
from core.vision.photo_stage import strip_sender_prefix

st.set_page_config(page_title="MCX Tracker", page_icon="☕", layout="wide")

projects = list_projects()
labels_to_key = {p["display_name"]: p["key"] for p in projects}

st.sidebar.header("Projeto")
selected_label = st.sidebar.radio(
    "Projeto", options=list(labels_to_key.keys()), label_visibility="collapsed"
)
PROJECT = labels_to_key[selected_label]
config = load_project_config(PROJECT)

st.title("☕ MCX Tracker")
st.caption(f"Acompanhamento de promotores — Projeto {config['display_name']}")

# --- Ação principal -----------------------------------------------------
top_left, top_right = st.columns([1, 3])
with top_left:
    sync_clicked = st.button("🔄 Sincronizar Agora", type="primary", use_container_width=True)

with top_right:
    last_sync = get_last_sync(PROJECT)
    if last_sync:
        st.caption(f"Última sincronização: {last_sync.strftime('%d/%m/%Y %H:%M:%S')}")
    else:
        st.caption("Ainda não sincronizado nesta instalação.")

if sync_clicked:
    with st.spinner("Sincronizando: abrindo WhatsApp, extraindo e gravando na planilha..."):
        result = run_full_pipeline(PROJECT, headless=False)
    if result.error:
        st.error(f"Erro na sincronização: {result.error}")
    else:
        st.success(
            f"Coleta: {result.collected_new} novas · "
            f"Extração: {result.extraction_processed} processadas, {result.extraction_needs_review} p/ revisão · "
            f"Planilha: {result.sync_written} gravadas, {result.sync_flagged} pendências"
        )
    st.rerun()

st.divider()

# --- Cards de status ------------------------------------------------------
with get_session() as session:
    stats = get_dashboard_stats(session, PROJECT)

c1, c2, c3, c4 = st.columns(4)
c1.metric("Fotos processadas", stats.photos_processed)
c2.metric("Pendências", stats.pending_count)
c3.metric("Erros", stats.error_count)
c4.metric("Visitas registradas hoje", stats.visits_today)

st.divider()

tab_pendencias, tab_historico = st.tabs(["📋 Pendências", "🕘 Histórico de alterações"])

# --- Pendências -------------------------------------------------------------
with tab_pendencias:
    with get_session() as session:
        pending_rows = session.execute(
            select(PendingReview, ProcessedMessage, ExtractionResult)
            .join(ProcessedMessage, ProcessedMessage.id == PendingReview.message_id)
            .outerjoin(ExtractionResult, ExtractionResult.message_id == ProcessedMessage.id)
            .where(PendingReview.status == "open", ProcessedMessage.project == PROJECT)
            .order_by(PendingReview.created_at.desc())
        ).all()

        store_cache_rows = session.execute(
            select(StoreCache).where(StoreCache.project == PROJECT)
        ).scalars().all()

    if not pending_rows:
        st.info("Nenhuma pendência no momento. 🎉")

    promoter_routing = config["sheets"].get("promoter_routing", {})
    default_worksheet_name = config["sheets"]["worksheet_name"]

    stores_by_sheet_and_mes = {}
    for row in store_cache_rows:
        stores_by_sheet_and_mes.setdefault((row.worksheet_name, row.mes_ano), []).append(row)

    for review, message, extraction in pending_rows:
        with st.container(border=True):
            col_img, col_info = st.columns([1, 2])

            with col_img:
                if message.media_path:
                    st.image(message.media_path, use_container_width=True)
                else:
                    st.write("_(sem imagem)_")

            with col_info:
                st.write(f"**Motivo:** {review.reason}")
                st.write(f"**Remetente:** {message.sender_name or '?'} ({message.sender_phone or 's/ telefone'})")
                if message.caption:
                    st.text_area("Legenda original", message.caption, height=100, disabled=True, key=f"cap_{message.id}")

                if st.button("🚫 Ignorar (não é promotor)", key=f"ignore_{review.id}"):
                    with get_session() as session:
                        db_review = session.get(PendingReview, review.id)
                        db_review.status = "ignored"
                        db_review.resolved_by = "painel"
                        db_review.resolved_at = dt.datetime.now(dt.timezone.utc)
                        db_message = session.get(ProcessedMessage, message.id)
                        db_message.status = "ignored"
                    st.info("Foto ignorada — não conta como visita.")
                    st.rerun()

                best_guess_date = (
                    extraction.chosen_date if extraction and extraction.chosen_date else
                    (message.message_timestamp.date() if message.message_timestamp else dt.date.today())
                )
                mes_ano = format_mes_ano(best_guess_date, config["sheets"]["month_abbreviations"])

                suggested_worksheet_name = resolve_target_worksheet(
                    [
                        extraction.promoter_raw if extraction else None,
                        message.sender_name,
                        message.sender_phone,
                    ],
                    promoter_routing,
                    default_worksheet_name,
                )
                available_worksheets = sorted({default_worksheet_name, *promoter_routing.values()})
                suggested_index = (
                    available_worksheets.index(suggested_worksheet_name)
                    if suggested_worksheet_name in available_worksheets
                    else 0
                )
                target_worksheet_name = st.selectbox(
                    "Aba de destino",
                    options=available_worksheets,
                    index=suggested_index,
                    key=f"sheet_{review.id}",
                    help=f"Sugestão automática pelo remetente: {suggested_worksheet_name}",
                )
                available_stores = stores_by_sheet_and_mes.get((target_worksheet_name, mes_ano), [])

                if not available_stores:
                    st.warning(
                        f"Nenhuma loja carregada para {mes_ano} na aba '{target_worksheet_name}' ainda. "
                        "Clique em 'Sincronizar Agora' pelo menos uma vez para carregar a lista."
                    )
                    continue

                store_labels = [f"{s.rede} ({s.cidade})" for s in available_stores]
                default_index = 0
                if review.candidates and review.candidates.get("store_candidates"):
                    guessed = str(review.candidates["store_candidates"][0]).upper()
                    for i, s in enumerate(available_stores):
                        if s.rede.upper() in guessed or guessed in s.rede.upper():
                            default_index = i
                            break

                chosen_label = st.selectbox(
                    "Loja correta",
                    options=store_labels,
                    index=default_index,
                    key=f"store_{review.id}",
                )
                chosen_store = available_stores[store_labels.index(chosen_label)]

                visit_date = st.date_input("Dia da visita", value=best_guess_date, key=f"date_{review.id}")

                if st.button("✅ Confirmar e gravar", key=f"confirm_{review.id}"):
                    worksheet = get_worksheet(config, worksheet_name=target_worksheet_name)
                    write_result = write_visit_day(worksheet, config, chosen_store.row_number, visit_date)

                    with get_session() as session:
                        if write_result.changed:
                            session.add(
                                AuditLog(
                                    project=PROJECT,
                                    loja=chosen_store.rede,
                                    promotor=(extraction.promoter_raw if extraction else None) or message.sender_name or "",
                                    dia=visit_date.day,
                                    semana_coluna=write_result.column_name,
                                    mes_ano=mes_ano,
                                    valor_anterior=write_result.previous_value,
                                    valor_novo=write_result.new_value,
                                    message_id=message.id,
                                    source="manual",
                                )
                            )
                        db_review = session.get(PendingReview, review.id)
                        db_review.status = "resolved"
                        db_review.resolved_by = "painel"
                        db_review.resolved_at = dt.datetime.now(dt.timezone.utc)
                        db_message = session.get(ProcessedMessage, message.id)
                        db_message.status = "written"

                        # Aprende com essa correção: da próxima vez que o mesmo
                        # texto (legenda ou palpite da Vision AI) aparecer,
                        # reconhece sozinho.
                        if message.caption:
                            body = strip_sender_prefix(message.caption, message.sender_name, message.sender_phone)
                            if body:
                                learn_alias(session, PROJECT, body, chosen_store.rede)
                        if extraction and extraction.chosen_store:
                            learn_alias(session, PROJECT, extraction.chosen_store, chosen_store.rede)

                    st.success(f"Gravado: {chosen_store.rede} — dia {visit_date.day} ({write_result.column_name})")
                    st.rerun()

# --- Histórico ---------------------------------------------------------------
with tab_historico:
    with get_session() as session:
        logs = session.execute(
            select(AuditLog)
            .where(AuditLog.project == PROJECT)
            .order_by(AuditLog.timestamp.desc())
            .limit(200)
        ).scalars().all()

    if not logs:
        st.info("Nenhuma alteração registrada ainda.")
    else:
        st.dataframe(
            [
                {
                    "Data/Hora": log.timestamp.strftime("%d/%m/%Y %H:%M:%S") if log.timestamp else "",
                    "Loja": log.loja,
                    "Promotor": log.promotor,
                    "Dia": log.dia,
                    "Semana": log.semana_coluna,
                    "Mês/Ano": log.mes_ano,
                    "Valor anterior": log.valor_anterior,
                    "Valor novo": log.valor_novo,
                    "Origem": log.source,
                }
                for log in logs
            ],
            use_container_width=True,
            hide_index=True,
        )
