"""Roda a extração (GIV / OCR+Vision AI) nas mensagens ainda não processadas.

Uso:
    python scripts/run_extraction.py cafe
"""
import sys

from core.db.session import get_session
from core.pipeline.extraction import extract_pending_messages

sys.stdout.reconfigure(encoding="utf-8")


def main() -> None:
    project = sys.argv[1] if len(sys.argv) > 1 else "cafe"

    with get_session() as session:
        counts = extract_pending_messages(session, project)

    print(f"Processadas: {counts.get('processed', 0)} | Ignoradas (sem foto ou foto de 'antes'): {counts.get('ignored', 0)} "
          f"| Precisam revisão: {counts.get('needs_review', 0)}")


if __name__ == "__main__":
    main()
