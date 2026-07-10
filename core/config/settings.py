"""Configurações globais do MCX Tracker.

Carrega variáveis de ambiente (.env) e os arquivos de config por projeto
(core/config/projects/*.yaml). Nenhum caminho ou credencial deve ficar
hardcoded fora daqui.

Todos os caminhos são resolvidos para absolutos a partir de BASE_DIR, mesmo
quando vêm relativos do .env — assim o sistema funciona igual seja rodado
via CLI (cwd = mcx_tracker/) ou via Streamlit (que pode iniciar com outro
diretório de trabalho).
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml
from dotenv import load_dotenv
import os

BASE_DIR = Path(__file__).resolve().parents[2]  # raiz de mcx_tracker/
PROJECTS_DIR = Path(__file__).resolve().parent / "projects"
DATA_DIR = BASE_DIR / "data"

load_dotenv(BASE_DIR / ".env")


def _resolve_path(raw: str | Path) -> Path:
    path = Path(raw)
    return path if path.is_absolute() else (BASE_DIR / path).resolve()


def _resolve_sqlite_url(url: str) -> str:
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        return url
    return f"{prefix}{_resolve_path(url[len(prefix):])}"


@dataclass(frozen=True)
class Settings:
    database_url: str
    google_service_account_file: Path
    vision_provider: str
    openai_api_key: str | None
    gemini_api_key: str | None
    confidence_threshold: float
    whatsapp_session_dir: Path
    media_dir: Path


def load_settings() -> Settings:
    return Settings(
        database_url=_resolve_sqlite_url(
            os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'mcx_tracker.db'}")
        ),
        google_service_account_file=_resolve_path(
            os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", DATA_DIR / "credentials" / "service_account.json")
        ),
        vision_provider=os.getenv("VISION_PROVIDER", "openai"),
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        gemini_api_key=os.getenv("GEMINI_API_KEY"),
        confidence_threshold=float(os.getenv("CONFIDENCE_THRESHOLD", "0.95")),
        whatsapp_session_dir=_resolve_path(os.getenv("WHATSAPP_SESSION_DIR", DATA_DIR / "sessions")),
        media_dir=_resolve_path(os.getenv("MEDIA_DIR", DATA_DIR / "media")),
    )


def load_project_config(project_name: str) -> dict:
    """Carrega o YAML de um projeto (ex.: 'cafe') de core/config/projects/."""
    config_path = PROJECTS_DIR / f"{project_name}.yaml"
    if not config_path.exists():
        raise FileNotFoundError(f"Config do projeto '{project_name}' não encontrada em {config_path}")
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def list_projects() -> list[dict]:
    """Lista todos os projetos configurados (um YAML por projeto em
    core/config/projects/), usado pelo seletor de projeto do painel."""
    projects = []
    for path in sorted(PROJECTS_DIR.glob("*.yaml")):
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        projects.append({"key": data["project"], "display_name": data.get("display_name", data["project"])})
    return projects


settings = load_settings()
