"""Upload de fotos pro Supabase Storage — armazenamento permanente.

O disco dos apps no Streamlit Community Cloud não é permanente: a cada
reinício do container, tudo que foi salvo em disco local (ex.: fotos de
avaria) some, mesmo que o cadastro em si continue no banco. Supabase
Storage resolve isso — é o mesmo projeto que já usamos pro Postgres, sem
custo extra, e devolve uma URL pública que dá pra usar direto em
`st.image(url)`.

Sem `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` configurados (ex.: rodando local
sem esses secrets), `upload_photo` devolve None e quem chamou decide o que
fazer (o app cai de volta pra salvar em disco local).
"""
from __future__ import annotations

import mimetypes
import os
import uuid

import requests

BUCKET = "avarias"


def _config() -> tuple[str, str] | None:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        return None
    return url, key


def is_configured() -> bool:
    return _config() is not None


def upload_photo(file_bytes: bytes, filename: str) -> str | None:
    """Envia a foto pro bucket e devolve a URL pública, ou None se o
    Storage não estiver configurado."""
    config = _config()
    if not config:
        return None
    url, key = config

    ext = os.path.splitext(filename)[1] or ".jpg"
    object_path = f"{uuid.uuid4().hex}{ext}"
    content_type = mimetypes.guess_type(filename)[0] or "image/jpeg"

    response = requests.post(
        f"{url}/storage/v1/object/{BUCKET}/{object_path}",
        headers={
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": content_type,
        },
        data=file_bytes,
        timeout=30,
    )
    response.raise_for_status()
    return f"{url}/storage/v1/object/public/{BUCKET}/{object_path}"
