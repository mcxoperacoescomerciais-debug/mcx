"""Identificação de loja/data via Vision AI (OpenAI ou Gemini).

Usado só quando a legenda não é do Sistema GIV (core/vision/giv_parser.py).
O texto do OCR (se disponível) é injetado no prompt como contexto extra —
uma única chamada de IA já recebendo imagem + texto, em vez de dois sistemas
competindo separadamente.
"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from pathlib import Path

from core.config.settings import settings

PROMPT_TEMPLATE = """Você está analisando uma foto enviada por um promotor de vendas em um grupo de WhatsApp, mostrando uma visita a uma loja (ponto de venda de produtos de café).

Legenda enviada junto com a foto: {caption}
Texto lido por OCR na imagem (pode estar incompleto ou vazio): {ocr_text}

Analise a IMAGEM e o contexto acima e responda em JSON com exatamente estes campos:
{{
  "loja_candidatos": [lista de nomes de loja possíveis, do mais provável ao menos provável, baseado em placas, fachadas, notas fiscais ou qualquer texto visível],
  "cidade": "cidade mencionada na imagem ou legenda, ou null",
  "data_texto": "qualquer data visível na própria imagem no formato DD/MM/AAAA, ou null",
  "confianca": número de 0 a 1 indicando o quão confiante você está na loja mais provável
}}

Se não conseguir identificar a loja com confiança, coloque confianca baixa (abaixo de 0.5) e liste os candidatos mais plausíveis mesmo assim. Responda só o JSON, nada mais."""


class VisionNotConfiguredError(RuntimeError):
    pass


@dataclass
class VisionResult:
    store_candidates: list[str] = field(default_factory=list)
    city: str | None = None
    date_text: str | None = None
    confidence: float = 0.0
    raw_response: str = ""


def _image_to_data_uri(image_path: Path) -> str:
    data = image_path.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


def _analyze_openai(image_path: Path, caption: str | None, ocr_text: str | None) -> VisionResult:
    if not settings.openai_api_key:
        raise VisionNotConfiguredError("OPENAI_API_KEY não configurada no .env")

    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    prompt = PROMPT_TEMPLATE.format(caption=caption or "(sem legenda)", ocr_text=ocr_text or "(vazio)")

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": _image_to_data_uri(image_path)}},
                ],
            }
        ],
        max_tokens=500,
    )
    raw = response.choices[0].message.content
    return _parse_response(raw)


GEMINI_MODEL = "gemini-2.5-flash"


def _analyze_gemini(image_path: Path, caption: str | None, ocr_text: str | None) -> VisionResult:
    if not settings.gemini_api_key:
        raise VisionNotConfiguredError("GEMINI_API_KEY não configurada no .env")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)
    prompt = PROMPT_TEMPLATE.format(caption=caption or "(sem legenda)", ocr_text=ocr_text or "(vazio)")

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            prompt,
            types.Part.from_bytes(data=image_path.read_bytes(), mime_type="image/jpeg"),
        ],
    )
    return _parse_response(response.text)


def _parse_response(raw: str) -> VisionResult:
    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        return VisionResult(raw_response=raw, confidence=0.0)

    return VisionResult(
        store_candidates=data.get("loja_candidatos", []),
        city=data.get("cidade"),
        date_text=data.get("data_texto"),
        confidence=float(data.get("confianca", 0.0)),
        raw_response=raw,
    )


def analyze_image(image_path: Path, caption: str | None, ocr_text: str | None) -> VisionResult:
    if settings.vision_provider == "gemini":
        return _analyze_gemini(image_path, caption, ocr_text)
    return _analyze_openai(image_path, caption, ocr_text)
