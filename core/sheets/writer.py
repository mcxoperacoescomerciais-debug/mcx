"""Escrita segura na planilha: nunca sobrescreve dias já lançados, nunca
duplica o mesmo dia, e só grava na coluna de semana (nunca em TOTAL,
% CUMPR ou A PAGAR — essas são calculadas por fórmula)."""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from core.sheets.calendar_utils import get_week_key


@dataclass
class WriteResult:
    row_number: int
    column_name: str
    previous_value: str
    new_value: str
    changed: bool


def parse_days(cell_value: str | None) -> list[int]:
    if not cell_value or not cell_value.strip():
        return []
    return [int(x) for x in cell_value.split("*") if x.strip().isdigit()]


def append_day(cell_value: str | None, day: int) -> tuple[str, bool]:
    """Retorna (novo_valor, mudou_algo). Idempotente: reprocessar o mesmo dia
    não duplica nem altera o valor."""
    days = parse_days(cell_value)
    if day in days:
        return cell_value or "", False
    days.append(day)
    return "*".join(str(d) for d in days), True


def get_column_index(worksheet, project_config: dict, column_name: str) -> int:
    header_row = project_config["sheets"].get("header_row", 1)
    header = worksheet.row_values(header_row)
    return header.index(column_name) + 1  # gspread usa índice base 1


def write_visit_day(
    worksheet,
    project_config: dict,
    row_number: int,
    visit_date: dt.date,
) -> WriteResult:
    columns_config = project_config["sheets"]["columns"]
    week_key = get_week_key(visit_date)
    week_column_name = columns_config[week_key]
    col_index = get_column_index(worksheet, project_config, week_column_name)

    day = visit_date.day
    current_value = worksheet.cell(row_number, col_index).value or ""
    new_value, changed = append_day(current_value, day)

    if changed:
        worksheet.update_cell(row_number, col_index, new_value)

    return WriteResult(
        row_number=row_number,
        column_name=week_column_name,
        previous_value=current_value,
        new_value=new_value,
        changed=changed,
    )
