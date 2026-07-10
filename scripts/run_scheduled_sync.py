"""Roda o pipeline completo de todos os projetos configurados, um de cada vez,
pensado para execução desatendida (Agendador de Tarefas do Windows).

Diferenças em relação a run_all_pipelines.py (uso manual/interativo):
- headless=True: não abre janela de navegador visível.
- Grava um log com timestamp em data/logs/, já que ninguém acompanha o
  terminal às 7h da manhã.
- Um projeto com erro não interrompe os demais (run_full_pipeline já
  captura exceções por projeto; aqui só garantimos o mesmo no nível do
  laço, por segurança).

Uso:
    python scripts/run_scheduled_sync.py
"""
import datetime as dt
import sys
from pathlib import Path

from core.config.settings import list_projects, DATA_DIR
from core.pipeline.runner import run_full_pipeline

LOG_DIR = DATA_DIR / "logs"


def main() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"sync_{dt.datetime.now():%Y-%m-%d_%H%M%S}.log"

    with open(log_path, "w", encoding="utf-8") as log:
        def write(line: str = "") -> None:
            print(line)
            log.write(line + "\n")

        start = dt.datetime.now()
        write(f"=== Sincronização agendada iniciada em {start:%d/%m/%Y %H:%M:%S} ===\n")

        projects = list_projects()
        write(f"{len(projects)} projetos: {', '.join(p['key'] for p in projects)}\n")

        for p in projects:
            key = p["key"]
            write(f"=== {p['display_name']} ({key}) ===")
            try:
                result = run_full_pipeline(key, headless=True)
            except Exception as exc:  # noqa: BLE001 - nenhum projeto pode travar os demais
                write(f"ERRO INESPERADO: {exc}\n")
                continue

            if result.error:
                write(f"ERRO: {result.error}\n")
                continue

            write(
                f"Coleta: {result.collected_new} novas, {result.collected_skipped} existentes | "
                f"Extração: {result.extraction_processed} processadas, {result.extraction_needs_review} revisão | "
                f"Planilha: {result.sync_written} gravadas, {result.sync_unchanged} sem mudança, {result.sync_flagged} pendências\n"
            )

        end = dt.datetime.now()
        write(f"=== Sincronização agendada concluída em {end:%d/%m/%Y %H:%M:%S} (duração: {end - start}) ===")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
