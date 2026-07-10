"""Verifica se a autenticação com o Google Sheets está funcionando.

Uso:
    python scripts/check_sheets_connection.py cafe
"""
import sys

# Garante que acentos apareçam certo mesmo em terminais Windows com codepage não-UTF-8.
sys.stdout.reconfigure(encoding="utf-8")

from core.config.settings import load_project_config
from core.sheets.client import get_worksheet


def main() -> None:
    project = sys.argv[1] if len(sys.argv) > 1 else "cafe"
    config = load_project_config(project)

    worksheet = get_worksheet(config)
    header_row = config["sheets"].get("header_row", 1)
    header = worksheet.row_values(header_row)

    print(f"Conectado à aba '{worksheet.title}' com sucesso.")
    print(f"Colunas encontradas: {header}")

    expected = set(config["sheets"]["columns"].values())
    missing = expected - set(header)
    if missing:
        print(f"\nATENÇÃO: colunas esperadas mas não encontradas no cabeçalho: {missing}")
        print("Confira o mapeamento em core/config/projects/cafe.yaml.")
    else:
        print("\nTodas as colunas configuradas foram encontradas no cabeçalho.")


if __name__ == "__main__":
    main()
