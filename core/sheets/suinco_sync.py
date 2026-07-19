"""Sincroniza cada novo item de avaria/vencimento com uma planilha Google
Sheets, na hora do cadastro — pra os gestores da marca acompanharem numa
planilha comum, sem precisar entrar em nenhum app.

Reaproveita a mesma Service Account já usada pelo acompanhamento de
promotores (core/sheets/client.py), mas resolve a credencial de dois jeitos
possíveis:
- Local: lê o arquivo de sempre (settings.google_service_account_file,
  configurável via GOOGLE_SERVICE_ACCOUNT_FILE no .env).
- Streamlit Cloud (sem disco persistente): lê o JSON inteiro da credencial
  de uma secret de ambiente, GOOGLE_SERVICE_ACCOUNT_JSON.

Se a planilha não estiver configurada (falta SUINCO_SHEET_ID ou credencial),
`append_avaria_row` só devolve False — o cadastro no banco (fonte de
verdade) nunca pode falhar por causa da planilha.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import traceback
from functools import lru_cache

import gspread
from google.oauth2.service_account import Credentials

from core.config.settings import settings

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

HEADER = [
    "Data/Hora", "Loja", "Promotor", "Produto", "Motivo",
    "Validade", "Quantidade", "Observação", "Foto 1", "Foto 2", "Foto 3",
]

@lru_cache(maxsize=1)
def _get_client() -> gspread.Client | None:
    json_env = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    if json_env:
        info = json.loads(json_env)
        creds = Credentials.from_service_account_info(info, scopes=SCOPES)
        return gspread.authorize(creds)

    # settings.google_service_account_file já resolve pra caminho absoluto
    # (a partir da raiz de mcx_tracker/), então funciona independente de
    # qual for o diretório de trabalho de quem rodou o Streamlit.
    if settings.google_service_account_file.exists():
        creds = Credentials.from_service_account_file(
            str(settings.google_service_account_file), scopes=SCOPES
        )
        return gspread.authorize(creds)

    return None


def _foto_formula(url: str | None) -> str:
    """Link clicável pra foto — testamos IMAGE() nessa planilha e ela
    sempre voltava #REF!, mesmo com URLs públicas conhecidas (ex.: logo do
    Google), então parece ser alguma restrição da conta/Workspace pra
    inserir imagem por URL, não um problema da nossa URL. HYPERLINK() é
    mais simples e funcionou no teste.

    Separador de argumento é ";" (não ","): a planilha está no locale
    pt_BR, que usa ";" pra separar argumentos de função.
    """
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        return ""
    return f'=HYPERLINK("{url}";"📷 Ver foto")'


def append_avaria_row(
    loja: str,
    promotor: str,
    produto: str,
    tipo: str | None,
    validade: dt.date | None,
    quantidade: int | None,
    observacao: str | None,
    foto_paths: list[str],
) -> bool:
    """Adiciona uma linha na planilha configurada (SUINCO_SHEET_ID).
    Devolve True se conseguiu, False se a planilha não estiver configurada
    ou algo falhar — quem chama não deve travar o cadastro por causa
    disso."""
    sheet_id = os.getenv("SUINCO_SHEET_ID", "")
    if not sheet_id:
        print("[suinco_sync] SUINCO_SHEET_ID não configurado — pulando sincronização.", file=sys.stderr)
        return False

    client = _get_client()
    if not client:
        print(
            "[suinco_sync] Sem credencial do Google (GOOGLE_SERVICE_ACCOUNT_JSON não "
            "configurado e arquivo local não encontrado) — pulando sincronização.",
            file=sys.stderr,
        )
        return False

    try:
        spreadsheet = client.open_by_key(sheet_id)
        worksheet = spreadsheet.sheet1
        existing_values = worksheet.get_all_values()
        # Planilha "vazia" ainda devolve [[]] (uma linha vazia), não [] —
        # por isso o "any" em vez de só checar se a lista está vazia.
        if not any(existing_values):
            worksheet.append_row(HEADER, value_input_option="USER_ENTERED")

        fotos = list(foto_paths or [])[:3]
        fotos += [None] * (3 - len(fotos))

        row = [
            dt.datetime.now().strftime("%d/%m/%Y %H:%M"),
            loja,
            promotor,
            produto,
            tipo or "",
            validade.strftime("%d/%m/%Y") if validade else "",
            quantidade if quantidade is not None else "",
            observacao or "",
            _foto_formula(fotos[0]),
            _foto_formula(fotos[1]),
            _foto_formula(fotos[2]),
        ]
        worksheet.append_row(row, value_input_option="USER_ENTERED")
        return True
    except Exception:
        print("[suinco_sync] Falha ao gravar na planilha:", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return False
