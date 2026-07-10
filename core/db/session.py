"""Engine e sessão SQLAlchemy do MCX Tracker."""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from core.config.settings import settings

engine = create_engine(settings.database_url, echo=False, future=True)
# expire_on_commit=False: o painel Streamlit lê atributos de objetos depois
# que o "with get_session()" já fechou (ex.: para exibir na tela). Sem isso,
# o SQLAlchemy expira os atributos no commit e tentar lê-los depois da sessão
# fechada gera DetachedInstanceError.
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True, expire_on_commit=False)


@contextmanager
def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
