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

TITLE = "MCX OPERAÇÕES COMERCIAIS — SUINCO | CONTROLE DE AVARIAS E VENCIMENTO"

MAX_FOTOS_PLANILHA = 10

HEADER = [
    "Data/Hora", "Loja", "Promotor", "Produto", "Motivo",
    "Validade", "Quantidade", "Observação",
] + [f"Foto {i}" for i in range(1, MAX_FOTOS_PLANILHA + 1)]

_COLUMN_WIDTHS = [130, 170, 140, 170, 150, 100, 95, 240] + [110] * MAX_FOTOS_PLANILHA

# Paleta executiva MCX: azul-marinho + dourado, a mesma da logo.
_COLOR_TITLE_BG = {"red": 0.043, "green": 0.067, "blue": 0.188}  # azul-marinho
_COLOR_HEADER_BG = {"red": 0.788, "green": 0.635, "blue": 0.153}  # dourado
_COLOR_WHITE = {"red": 1, "green": 1, "blue": 1}
_COLOR_BAND = {"red": 0.965, "green": 0.957, "blue": 0.925}  # bege claro (tom dourado suave)


def _apply_professional_formatting(worksheet: gspread.Worksheet) -> None:
    """Aplica visual de planilha corporativa: título mesclado, cabeçalho
    colorido, colunas com largura razoável, linhas congeladas e listras
    alternadas — pra ficar apresentável pra diretoria, não só funcional."""
    n_cols = len(HEADER)
    last_col_a1 = gspread.utils.rowcol_to_a1(1, n_cols)
    worksheet.merge_cells(f"A1:{last_col_a1}")
    worksheet.format(f"A1:{last_col_a1}", {
        "backgroundColor": _COLOR_TITLE_BG,
        "horizontalAlignment": "CENTER",
        "textFormat": {"bold": True, "fontSize": 12, "foregroundColor": _COLOR_WHITE},
    })
    worksheet.format(f"A2:{gspread.utils.rowcol_to_a1(2, n_cols)}", {
        "backgroundColor": _COLOR_HEADER_BG,
        "horizontalAlignment": "CENTER",
        # Texto escuro (não branco) — dourado é claro demais pra manter
        # contraste legível com texto branco.
        "textFormat": {"bold": True, "fontSize": 10, "foregroundColor": _COLOR_TITLE_BG},
    })
    worksheet.freeze(rows=2)

    requests = []
    for i, width in enumerate(_COLUMN_WIDTHS):
        requests.append({
            "updateDimensionProperties": {
                "range": {
                    "sheetId": worksheet.id,
                    "dimension": "COLUMNS",
                    "startIndex": i,
                    "endIndex": i + 1,
                },
                "properties": {"pixelSize": width},
                "fields": "pixelSize",
            }
        })
    banded_range = {
        "range": {
            "sheetId": worksheet.id,
            "startRowIndex": 2,
            "startColumnIndex": 0,
            "endColumnIndex": n_cols,
        },
        "rowProperties": {
            "headerColorStyle": {"rgbColor": _COLOR_WHITE},
            "firstBandColorStyle": {"rgbColor": _COLOR_WHITE},
            "secondBandColorStyle": {"rgbColor": _COLOR_BAND},
        },
    }
    # Reaplicar a formatação não pode dar erro se a faixa (banding) já
    # existir de uma vez anterior — nesse caso, atualiza em vez de tentar
    # adicionar de novo (a API rejeita "addBanding" numa faixa que já tem).
    existing_banded_ranges = worksheet.spreadsheet.fetch_sheet_metadata().get("sheets", [])
    existing_band_id = None
    for sheet_meta in existing_banded_ranges:
        if sheet_meta["properties"]["sheetId"] == worksheet.id:
            for band in sheet_meta.get("bandedRanges", []):
                existing_band_id = band["bandedRangeId"]
                break

    if existing_band_id is not None:
        banded_range["bandedRangeId"] = existing_band_id
        requests.append({"updateBanding": {"bandedRange": banded_range, "fields": "*"}})
    else:
        requests.append({"addBanding": {"bandedRange": banded_range}})

    worksheet.spreadsheet.batch_update({"requests": requests})

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
            worksheet.update(values=[[TITLE]], range_name="A1")
            worksheet.update(values=[HEADER], range_name="A2")
            _apply_professional_formatting(worksheet)

        fotos = list(foto_paths or [])[:MAX_FOTOS_PLANILHA]
        fotos += [None] * (MAX_FOTOS_PLANILHA - len(fotos))

        row = [
            dt.datetime.now().strftime("%d/%m/%Y %H:%M"),
            loja,
            promotor,
            produto,
            tipo or "",
            validade.strftime("%d/%m/%Y") if validade else "",
            quantidade if quantidade is not None else "",
            observacao or "",
        ] + [_foto_formula(f) for f in fotos]
        worksheet.append_row(row, value_input_option="USER_ENTERED")
        return True
    except Exception:
        print("[suinco_sync] Falha ao gravar na planilha:", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return False
