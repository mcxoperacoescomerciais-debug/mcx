"""Grava na planilha real as visitas já extraídas com confiança suficiente.

Uso:
    python scripts/run_sync.py cafe
"""
import sys

from core.config.settings import load_project_config
from core.db.session import get_session
from core.pipeline.sync import sync_to_sheet
from core.sheets.client import get_spreadsheet

sys.stdout.reconfigure(encoding="utf-8")


def main() -> None:
    project = sys.argv[1] if len(sys.argv) > 1 else "cafe"
    config = load_project_config(project)
    spreadsheet = get_spreadsheet(config)

    with get_session() as session:
        stats = sync_to_sheet(session, spreadsheet, project, config)

    print(f"Gravadas: {stats.written} | Sem mudança (dia já existia): {stats.unchanged} | Pendências: {stats.flagged}")


if __name__ == "__main__":
    main()
