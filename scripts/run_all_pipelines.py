"""Roda o pipeline completo de todos os projetos configurados, em sequência
(não dá para rodar em paralelo — todos usam a mesma sessão do WhatsApp Web).

Uso:
    python scripts/run_all_pipelines.py
"""
import sys

from core.config.settings import list_projects
from core.pipeline.runner import run_full_pipeline

sys.stdout.reconfigure(encoding="utf-8")


def main() -> None:
    projects = list_projects()
    print(f"{len(projects)} projetos: {', '.join(p['key'] for p in projects)}\n")

    for p in projects:
        key = p["key"]
        print(f"=== {p['display_name']} ({key}) ===")
        result = run_full_pipeline(key, headless=False)
        if result.error:
            print(f"ERRO: {result.error}\n")
            continue
        print(
            f"Coleta: {result.collected_new} novas, {result.collected_skipped} existentes | "
            f"Extração: {result.extraction_processed} processadas, {result.extraction_needs_review} revisão | "
            f"Planilha: {result.sync_written} gravadas, {result.sync_unchanged} sem mudança, {result.sync_flagged} pendências\n"
        )


if __name__ == "__main__":
    main()
