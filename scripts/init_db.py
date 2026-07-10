"""Cria as tabelas do SQLite (rodar uma vez, ou após mudar core/db/models.py).

Uso:
    python scripts/init_db.py
"""
from core.db.models import Base
from core.db.session import engine


def main() -> None:
    Base.metadata.create_all(engine)
    print(f"Tabelas criadas em: {engine.url}")


if __name__ == "__main__":
    main()
