"""Orquestra o ciclo completo (coleta -> extração -> gravação).

Usado tanto pelo script de linha de comando (scripts/run_pipeline.py) quanto
pelo botão "Sincronizar Agora" do painel Streamlit — a lógica mora só aqui
para não duplicar entre os dois.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from playwright.sync_api import sync_playwright

from core.config.settings import load_project_config, settings
from core.db.session import get_session
from core.pipeline.extraction import extract_pending_messages
from core.pipeline.sync import sync_to_sheet
from core.pipeline.sync_state import set_last_sync
from core.sheets.client import get_spreadsheet
from core.whatsapp.client import launch_context, open_whatsapp, wait_for_login
from core.whatsapp.collector import extract_messages, open_group, save_new_messages


@dataclass
class PipelineResult:
    collected_new: int = 0
    collected_skipped: int = 0
    extraction_processed: int = 0
    extraction_needs_review: int = 0
    sync_written: int = 0
    sync_unchanged: int = 0
    sync_flagged: int = 0
    error: str | None = None


def run_full_pipeline(project: str = "cafe", headless: bool = False) -> PipelineResult:
    result = PipelineResult()
    config = load_project_config(project)
    group_name = config["whatsapp"]["group_name"]

    try:
        with sync_playwright() as p:
            context = launch_context(p, headless=headless)
            page = open_whatsapp(context)

            if not wait_for_login(page, timeout_seconds=15):
                context.close()
                result.error = "Sessão do WhatsApp não está logada. Rode scripts/run_whatsapp_login.py primeiro."
                return result

            if not open_group(page, group_name):
                context.close()
                result.error = f"Não consegui abrir o grupo '{group_name}'."
                return result

            messages = extract_messages(page)
            with get_session() as session:
                saved, skipped = save_new_messages(
                    session=session,
                    page=page,
                    project=project,
                    chat_group=group_name,
                    messages=messages,
                    media_dir=settings.media_dir,
                )
            result.collected_new = saved
            result.collected_skipped = skipped
            context.close()

        with get_session() as session:
            counts = extract_pending_messages(session, project)
            result.extraction_processed = counts.get("processed", 0)
            result.extraction_needs_review = counts.get("needs_review", 0)

        spreadsheet = get_spreadsheet(config)
        with get_session() as session:
            stats = sync_to_sheet(session, spreadsheet, project, config)
        result.sync_written = stats.written
        result.sync_unchanged = stats.unchanged
        result.sync_flagged = stats.flagged

        set_last_sync(project, dt.datetime.now())
    except Exception as exc:  # noqa: BLE001 - queremos capturar e mostrar no painel
        result.error = str(exc)

    return result
