"""Última etapa: pega mensagens já extraídas (Fase 2) e resolvidas, acha a
linha certa na planilha real (REDE + MÊS/ANO) e grava o dia na coluna de
semana certa — sem nunca sobrescrever ou duplicar.

Se a loja não bater com nenhuma linha da planilha (ex.: mês ainda não
preparado, ou nome não reconhecido), a mensagem vira pendência em vez de
adivinhar.

Um projeto pode gravar em mais de uma aba da mesma planilha, roteado pelo
nome do promotor (core/sheets/routing.py) — por isso cada linha lida é
associada à aba de onde veio, e o cache de lojas é por (projeto, aba).
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from core.db.models import AuditLog, ExtractionResult, PendingReview, ProcessedMessage
from core.sheets.calendar_utils import format_mes_ano
from core.sheets.routing import resolve_target_worksheet
from core.sheets.store_matcher import find_match, load_rows_from_sheet, sync_cache
from core.sheets.writer import write_visit_day


@dataclass
class SyncStats:
    written: int = 0
    unchanged: int = 0
    flagged: int = 0


def sync_to_sheet(session: Session, spreadsheet, project: str, project_config: dict) -> SyncStats:
    sheets_cfg = project_config["sheets"]
    routing = sheets_cfg.get("promoter_routing", {})
    default_worksheet_name = sheets_cfg["worksheet_name"]
    month_abbrevs = sheets_cfg["month_abbreviations"]
    stats = SyncStats()

    # (nome da aba) -> (objeto worksheet, linhas carregadas).
    worksheet_cache: dict[str, tuple[object, list]] = {}

    def get_worksheet_and_rows(worksheet_name: str):
        if worksheet_name not in worksheet_cache:
            worksheet = spreadsheet.worksheet(worksheet_name)
            rows = load_rows_from_sheet(worksheet, project_config)
            sync_cache(session, project, worksheet_name, rows)
            worksheet_cache[worksheet_name] = (worksheet, rows)
        return worksheet_cache[worksheet_name]

    # Carrega (e atualiza o cache de) TODAS as abas do projeto — a padrão e
    # todas as de promoter_routing — mesmo que nenhuma mensagem desta rodada
    # precise escrever nelas. Sem isso, a fila de Pendências do painel fica
    # sem lista de lojas para uma aba até que alguma mensagem seja roteada
    # para ela automaticamente, o que pode nunca acontecer.
    for worksheet_name in {default_worksheet_name, *routing.values()}:
        get_worksheet_and_rows(worksheet_name)

    to_write = session.execute(
        select(ProcessedMessage, ExtractionResult)
        .join(ExtractionResult, ExtractionResult.message_id == ProcessedMessage.id)
        .where(ProcessedMessage.project == project, ProcessedMessage.status == "processed")
    ).all()

    for message, extraction in to_write:
        target_worksheet_name = resolve_target_worksheet(
            [extraction.promoter_raw, message.sender_name, message.sender_phone],
            routing,
            default_worksheet_name,
        )
        worksheet, rows = get_worksheet_and_rows(target_worksheet_name)

        mes_ano = format_mes_ano(extraction.chosen_date, month_abbrevs)
        match = find_match(rows, extraction.chosen_store, mes_ano, extraction.city_text)

        if match.row is None:
            message.status = "needs_review"
            session.add(
                PendingReview(
                    message_id=message.id,
                    reason="row_not_found",
                    candidates={
                        "store_text": extraction.chosen_store,
                        "city_text": extraction.city_text,
                        "mes_ano": mes_ano,
                        "worksheet_name": target_worksheet_name,
                        "top_candidates": [
                            {"rede": c[0].rede, "score": c[1]} for c in match.candidates
                        ],
                    },
                )
            )
            stats.flagged += 1
            continue

        day = extraction.chosen_date.day
        result = write_visit_day(worksheet, project_config, match.row.row_number, extraction.chosen_date)

        if result.changed:
            session.add(
                AuditLog(
                    project=project,
                    loja=match.row.rede,
                    promotor=extraction.promoter_raw or message.sender_name or "",
                    dia=day,
                    semana_coluna=result.column_name,
                    mes_ano=mes_ano,
                    valor_anterior=result.previous_value,
                    valor_novo=result.new_value,
                    message_id=message.id,
                    source="auto",
                )
            )
            stats.written += 1
        else:
            stats.unchanged += 1

        message.status = "written"

    return stats
