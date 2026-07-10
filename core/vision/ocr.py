"""OCR local (Tesseract) — sinal auxiliar para o Vision AI, não obrigatório.

Se o Tesseract não estiver instalado no sistema, o resolver simplesmente
segue sem esse sinal (o Vision AI consegue ler texto de imagem sozinho).
"""
from __future__ import annotations

from pathlib import Path

import pytesseract
from PIL import Image


def is_available() -> bool:
    try:
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def extract_text(image_path: Path) -> str | None:
    if not is_available():
        return None
    try:
        image = Image.open(image_path)
        text = pytesseract.image_to_string(image, lang="por")
        return text.strip() or None
    except Exception:
        return None
