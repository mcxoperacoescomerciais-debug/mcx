"""Regras de calendário: em qual coluna de semana uma data cai, e como montar
o valor de MÊS/ANO no formato usado na planilha (ex.: "JUL/2026").

As semanas seguem o calendário real (segunda a domingo), não blocos fixos de
7 dias a partir do dia 1. Isso importa porque o dia 1 do mês raramente cai
numa segunda-feira: em julho/2026, por exemplo, o dia 1 é quarta-feira, então
a 1ª semana do mês vai só até o domingo dia 5, e o dia 6 (segunda) já
pertence à 2ª semana.

A 5ª semana é sempre o bucket final (pode ter mais de 7 dias nos meses em
que o dia 1 cai perto do fim de uma semana), já que a planilha só tem 5
colunas de semana.
"""
from __future__ import annotations

import datetime as dt


def get_week_key(date: dt.date) -> str:
    first_of_month = date.replace(day=1)
    first_weekday = first_of_month.isoweekday()  # segunda=1 ... domingo=7
    days_in_first_week = 8 - first_weekday  # até o primeiro domingo do mês

    if date.day <= days_in_first_week:
        week_num = 1
    else:
        week_num = 2 + (date.day - days_in_first_week - 1) // 7

    return f"semana_{min(week_num, 5)}"


def get_week_column(date: dt.date, columns_config: dict) -> str:
    """Retorna o nome real da coluna (ex.: '2º SEM') a partir da data da visita."""
    return columns_config[get_week_key(date)]


def format_mes_ano(date: dt.date, month_abbreviations: dict) -> str:
    """Monta o valor de MÊS/ANO no formato da planilha, ex.: 'JUL/2026'."""
    abbrev = month_abbreviations[date.month]
    return f"{abbrev}/{date.year}"
