"""Parser do texto estruturado gerado pelo "Sistema GIV".

Boa parte das visitas do grupo "Grupo HL Café bravo" não chega como foto
solta: vem de um app de auditoria de campo (GIV) que posta no grupo uma
legenda com campos fixos, por exemplo:

    Compartilhamento de imagens sistema GIV
    Usuario: INGRID ALINE NOGUEIRA DOS SANTOS
    Ponto de atendimento: SUPERMERCADOS SUPER SO AEROPORTO SETE LAGOAS
    Sete Lagoas
    Data/Hora atendimento: 06/07/2026 09:29:55
    Formulário: Auditoria de Execução - Diário
    Campo: Foto (pos execucao/planograma ok)

Quando esse padrão é detectado, promotor/loja/cidade/data vêm direto do
texto — não precisa de OCR nem de Vision AI, e a confiança é alta porque é
texto gerado por máquina, não uma leitura de imagem.
"""
from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass

GIV_MARKER = "sistema giv"

USUARIO_RE = re.compile(r"Usuario:\s*(.+)", re.IGNORECASE)
PONTO_RE = re.compile(r"Ponto de atendimento:\s*(.+)", re.IGNORECASE)
DATA_HORA_RE = re.compile(
    r"Data/Hora atendimento:\s*(\d{2})/(\d{2})/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})",
    re.IGNORECASE,
)
# Linhas que não devem ser confundidas com o nome da cidade, caso a estrutura
# do texto mude de ordem.
KNOWN_FIELD_PREFIXES = ("data/hora", "formulário", "formulario", "campo", "usuario", "hora da")

# Confiança alta por ser texto estruturado (não é palpite de IA), mas não
# 100% porque ainda depende do promotor ter preenchido o app corretamente.
GIV_CONFIDENCE = 0.97


@dataclass
class GivExtraction:
    promoter_name: str
    store_text: str
    city_text: str | None
    visit_datetime: dt.datetime
    confidence: float = GIV_CONFIDENCE


def is_giv_message(caption: str | None) -> bool:
    return bool(caption) and GIV_MARKER in caption.lower()


def _extract_city(caption: str) -> str | None:
    lines = [line.strip() for line in caption.split("\n") if line.strip()]
    for i, line in enumerate(lines):
        if line.lower().startswith("ponto de atendimento:"):
            if i + 1 < len(lines):
                candidate = lines[i + 1]
                if not candidate.lower().startswith(KNOWN_FIELD_PREFIXES):
                    return candidate
            return None
    return None


def parse_giv_caption(caption: str | None) -> GivExtraction | None:
    """Retorna None se a legenda não for do Sistema GIV ou estiver incompleta
    (nesse caso o chamador deve cair no caminho de OCR/Vision AI)."""
    if not is_giv_message(caption):
        return None

    usuario_match = USUARIO_RE.search(caption)
    ponto_match = PONTO_RE.search(caption)
    data_hora_match = DATA_HORA_RE.search(caption)

    if not (usuario_match and ponto_match and data_hora_match):
        return None

    day, month, year, hour, minute, second = data_hora_match.groups()
    visit_datetime = dt.datetime(
        int(year), int(month), int(day), int(hour), int(minute), int(second)
    )

    return GivExtraction(
        promoter_name=usuario_match.group(1).strip(),
        store_text=ponto_match.group(1).strip(),
        city_text=_extract_city(caption),
        visit_datetime=visit_datetime,
    )
