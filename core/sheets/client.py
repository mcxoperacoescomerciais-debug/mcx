"""Autenticação e conexão com o Google Sheets via Service Account.

A lógica de leitura/escrita de células (Fase 4) fica em writer.py e
store_matcher.py — este módulo só resolve "conseguir uma referência
autenticada à planilha/aba do projeto".
"""
from __future__ import annotations

from functools import lru_cache

import gspread
from google.oauth2.service_account import Credentials

from core.config.settings import settings

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
]


@lru_cache(maxsize=1)
def get_gspread_client() -> gspread.Client:
    if not settings.google_service_account_file.exists():
        raise FileNotFoundError(
            "Credencial de Service Account não encontrada em "
            f"{settings.google_service_account_file}. Veja o README para "
            "instruções de como gerar e compartilhar a planilha com o robô."
        )
    creds = Credentials.from_service_account_file(
        str(settings.google_service_account_file), scopes=SCOPES
    )
    return gspread.authorize(creds)


def get_spreadsheet(project_config: dict) -> gspread.Spreadsheet:
    client = get_gspread_client()
    return client.open_by_key(project_config["sheets"]["spreadsheet_id"])


def get_worksheet(project_config: dict, worksheet_name: str | None = None) -> gspread.Worksheet:
    """Abre uma aba da planilha do projeto. Por padrão abre a aba principal
    configurada (sheets.worksheet_name) — passe worksheet_name para abrir
    outra aba da mesma planilha (usado no roteamento por promotor, ver
    core/sheets/routing.py)."""
    spreadsheet = get_spreadsheet(project_config)
    name = worksheet_name or project_config["sheets"]["worksheet_name"]
    return spreadsheet.worksheet(name)
