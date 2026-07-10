"""Ciclo completo: coleta mensagens novas do WhatsApp, extrai (GIV/Vision AI)
e grava na planilha. É o que o botão "Sincronizar Agora" do painel chama.

Uso:
    python scripts/run_pipeline.py cafe
"""
import sys

from core.pipeline.runner import run_full_pipeline

sys.stdout.reconfigure(encoding="utf-8")


def main() -> None:
    project = sys.argv[1] if len(sys.argv) > 1 else "cafe"
    result = run_full_pipeline(project, headless=False)

    if result.error:
        print("ERRO:", result.error)
        return

    print(f"Coleta:   novas={result.collected_new} | já existentes={result.collected_skipped}")
    print(f"Extração: processadas={result.extraction_processed} | precisam revisão={result.extraction_needs_review}")
    print(f"Planilha: gravadas={result.sync_written} | sem mudança={result.sync_unchanged} | pendências={result.sync_flagged}")


if __name__ == "__main__":
    main()
