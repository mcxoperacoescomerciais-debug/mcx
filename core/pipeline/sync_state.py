"""Guarda o horário da última sincronização de cada projeto (usado pelo card
do painel) — um arquivo só, com uma entrada por projeto."""
from __future__ import annotations

import datetime as dt
import json

from core.config.settings import settings

STATE_FILE = settings.media_dir.parent / "sync_state.json"


def _read_state() -> dict:
    if not STATE_FILE.exists():
        return {}
    return json.loads(STATE_FILE.read_text(encoding="utf-8"))


def get_last_sync(project: str) -> dt.datetime | None:
    raw = _read_state().get(project)
    return dt.datetime.fromisoformat(raw) if raw else None


def set_last_sync(project: str, timestamp: dt.datetime) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = _read_state()
    data[project] = timestamp.isoformat()
    STATE_FILE.write_text(json.dumps(data), encoding="utf-8")
