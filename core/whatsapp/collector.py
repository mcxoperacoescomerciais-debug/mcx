"""Coleta de mensagens novas de um grupo do WhatsApp Web.

Seletores calibrados por inspeção ao vivo do DOM real (ver notas inline).
O WhatsApp Web muda o HTML com frequência — por isso cada seletor crítico
tem um comentário explicando o que ele identifica, para facilitar o conserto
futuro caso pare de funcionar.
"""
from __future__ import annotations

import base64
import datetime as dt
import hashlib
import re
from pathlib import Path

from playwright.sync_api import Page
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.db.models import ProcessedMessage
from core.whatsapp.models import RawMessage

# Caixa de busca: <input role="textbox" data-tab="3">. Atributo estrutural,
# não depende do idioma da conta.
SEARCH_INPUT_SELECTOR = 'input[data-tab="3"]'

# Itens da lista de conversas (sidebar) usam role="row".
CHAT_LIST_ROW_SELECTOR = 'div[role="row"]'

# Mensagens dentro de uma conversa aberta: cada uma tem
# data-testid="conv-msg-<ID>" e data-id="<ID>" (o <ID> é estável e único —
# é a chave de deduplicação).
MESSAGE_SELECTOR = 'div[data-testid^="conv-msg-"]'

# Formato observado: "[15:06, 03/07/2026] +55 37 9922-7293: "
PRE_PLAIN_TEXT_RE = re.compile(r"^\[(\d{2}):(\d{2}), (\d{2})/(\d{2})/(\d{4})\]\s*(.*?):\s*$")

# Hora "HH:MM" no rodapé de cada mensagem — existe mesmo sem legenda,
# diferente do data-pre-plain-text (que só existe quando há texto).
TIME_ONLY_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def find_group_row(page: Page, group_name: str):
    """Busca o grupo pelo nome e retorna o locator da linha correspondente na sidebar."""
    search_box = page.locator(SEARCH_INPUT_SELECTOR)
    search_box.click()
    search_box.fill(group_name)
    page.wait_for_timeout(1500)

    rows = page.locator(CHAT_LIST_ROW_SELECTOR).all()
    for row in rows:
        if group_name in row.inner_text():
            return row
    return None


def open_group(page: Page, group_name: str, timeout_seconds: int = 20) -> bool:
    """Abre o grupo pelo nome. Retorna True se conseguiu abrir e carregar mensagens."""
    row = find_group_row(page, group_name)
    if row is None:
        return False

    row.click(force=True)
    page.wait_for_selector("header", timeout=timeout_seconds * 1000)
    return wait_messages_stable(page, timeout_seconds=timeout_seconds)


def wait_messages_stable(page: Page, timeout_seconds: int = 15) -> bool:
    """Espera a lista de mensagens parar de crescer (evita ler no meio do carregamento)."""
    stable_count = -1
    for _ in range(timeout_seconds * 2):
        current = page.locator(MESSAGE_SELECTOR).count()
        if current > 0 and current == stable_count:
            return True
        stable_count = current
        page.wait_for_timeout(500)
    return stable_count > 0


def _parse_pre_plain_text(raw: str | None) -> tuple[dt.datetime | None, str | None]:
    """Extrai (timestamp, identificador_remetente) de algo como
    '[15:06, 03/07/2026] +55 37 9922-7293: '."""
    if not raw:
        return None, None
    match = PRE_PLAIN_TEXT_RE.match(raw.strip())
    if not match:
        return None, None
    hour, minute, day, month, year, sender = match.groups()
    timestamp = dt.datetime(int(year), int(month), int(day), int(hour), int(minute))
    return timestamp, sender.strip()


def _extract_one_message(row) -> RawMessage:
    message_id = row.get_attribute("data-id") or row.locator("[data-id]").first.get_attribute("data-id")

    pre_plain_text = row.evaluate(
        """el => {
            const c = el.querySelector('.copyable-text');
            return c ? c.getAttribute('data-pre-plain-text') : null;
        }"""
    )
    timestamp, sender_phone = _parse_pre_plain_text(pre_plain_text)

    # Mensagem enviada pela própria conta (o "tail" de saída no balão) —
    # sempre a conta administrativa que opera o WhatsApp Web, nunca um
    # promotor no campo. Não tem cabeçalho de nome de remetente visível
    # (só um aria-label invisível "Você:"), então a heurística de "primeira
    # linha = nome" abaixo quebraria para essas mensagens.
    is_outgoing = row.evaluate(
        """el => !!el.querySelector('[data-testid="tail-out"]')"""
    )

    # ".copyable-text" também pode conter, além do texto da própria mensagem:
    # - um bloco de mensagem citada (reply), com o texto/remetente da
    #   mensagem ORIGINAL sendo respondida ([data-testid="quoted-message"]);
    # - um cartão de contato compartilhado ([data-testid="vcard-msg"]), cujo
    #   nome do contato não é texto digitado pelo remetente.
    # Sem remover os dois antes de ler innerText, a legenda capturada vira
    # uma mistura de texto alheio (citação/contato) com o texto de verdade,
    # o que gera "match" falso contra nomes de loja reais só por coincidência
    # de palavras.
    caption = row.evaluate(
        """el => {
            const c = el.querySelector('.copyable-text');
            if (!c) return null;
            const clone = c.cloneNode(true);
            clone.querySelectorAll('[data-testid="quoted-message"], [data-testid="vcard-msg"]')
                .forEach(node => node.remove());
            return clone.innerText;
        }"""
    )

    # O nome de exibição do remetente normalmente aparece como a primeira
    # linha do texto da linha inteira (só no primeiro balão de uma sequência
    # do mesmo remetente). Se não achar um padrão de telefone nela, assume
    # que é o nome. Não se aplica a mensagens de saída (ver is_outgoing
    # acima) — nelas essa "primeira linha" seria o próprio texto da
    # mensagem, não um nome de remetente.
    sender_name = None
    if not is_outgoing:
        full_text = row.inner_text()
        first_line = full_text.split("\n", 1)[0].strip() if full_text else ""
        looks_like_phone = bool(re.match(r"^\+?\d", first_line))
        sender_name = first_line if first_line and not looks_like_phone else None

    image_srcs = []
    best_src = row.evaluate(
        """el => {
            const imgs = Array.from(el.querySelectorAll('img'));
            const best = imgs.sort((a,b) => (b.naturalWidth*b.naturalHeight) - (a.naturalWidth*a.naturalHeight))[0];
            return (best && best.naturalWidth > 100) ? best.src : null;
        }"""
    )
    if best_src:
        image_srcs.append(best_src)

    time_only = row.evaluate(
        """el => {
            const meta = el.querySelector('[data-testid="msg-meta"] span');
            return meta ? meta.innerText.trim() : null;
        }"""
    )
    if time_only and not TIME_ONLY_RE.match(time_only):
        time_only = None

    return RawMessage(
        message_id=message_id,
        sender_name=sender_name,
        sender_phone=sender_phone,
        message_timestamp=timestamp,
        caption=caption,
        image_srcs=image_srcs,
        time_only=time_only,
        is_outgoing=bool(is_outgoing),
    )


def _fill_missing_dates(messages: list[RawMessage]) -> None:
    """Preenche a data de mensagens sem legenda (sem data-pre-plain-text),
    usando a data da mensagem anterior com timestamp completo + a hora
    visível (time_only). As mensagens chegam em ordem cronológica na tela,
    então a data só muda quando a hora "anda pra trás" (virou o dia).

    Mensagens no início da janela visível que não têm nenhuma mensagem
    anterior com data completa continuam sem data (viram pendência em vez
    de arriscar uma data errada).
    """
    last_full_dt: dt.datetime | None = None

    for msg in messages:
        if msg.message_timestamp is not None:
            last_full_dt = msg.message_timestamp
            continue

        if last_full_dt is None or not msg.time_only:
            continue

        hour, minute = (int(part) for part in msg.time_only.split(":"))
        candidate_date = last_full_dt.date()
        candidate_time = dt.time(hour, minute)

        # Se a hora desta mensagem é "menor" que a da referência anterior
        # (completa ou já inferida), o dia virou entre as duas.
        if candidate_time < last_full_dt.time():
            candidate_date += dt.timedelta(days=1)

        msg.message_timestamp = dt.datetime.combine(candidate_date, candidate_time)
        last_full_dt = msg.message_timestamp


def extract_messages(page: Page) -> list[RawMessage]:
    """Lê todas as mensagens atualmente carregadas na conversa aberta.

    O WhatsApp Web virtualiza a lista: mensagens fora da área visível existem
    no DOM só como um placeholder vazio (data-virtualized="true" sem
    conteúdo real) reservando espaço. Essas são ignoradas aqui — não são
    lixo, só ainda não renderizaram; um próximo ciclo de coleta as pega
    quando estiverem à vista.

    Uma linha também pode "sumir" (ser desmontada pela virtualização) entre
    o momento em que foi localizada e o momento em que tentamos ler seu
    conteúdo, em grupos com bastante atividade. Isso não deve travar a
    coleta inteira — a linha problemática é pulada e pega no próximo ciclo.
    """
    rows = page.locator(MESSAGE_SELECTOR).all()
    messages = []
    for row in rows:
        try:
            if not row.inner_text(timeout=5000).strip() and row.locator("img").count() == 0:
                continue
            messages.append(_extract_one_message(row))
        except Exception:
            continue

    _fill_missing_dates(messages)
    return messages


def download_image_bytes(page: Page, src: str) -> bytes:
    """Baixa uma imagem (blob: ou https:) de dentro da página.

    Funciona porque o fetch roda no contexto da própria página do WhatsApp
    Web, que já descriptografa a mídia (via service worker) antes de expor
    o conteúdo — buscar a URL fora do navegador não funcionaria.
    """
    result = page.evaluate(
        """
        async (url) => {
            const resp = await fetch(url);
            const buf = await resp.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
        }
        """,
        src,
    )
    return base64.b64decode(result)


def save_new_messages(
    session: Session,
    page: Page,
    project: str,
    chat_group: str,
    messages: list[RawMessage],
    media_dir: Path,
) -> tuple[int, int]:
    """Persiste mensagens ainda não vistas. Retorna (novas, já_existentes)."""
    saved = 0
    skipped = 0

    for msg in messages:
        if not msg.message_id:
            continue

        already_exists = session.execute(
            select(ProcessedMessage.id).where(
                ProcessedMessage.project == project,
                ProcessedMessage.message_id == msg.message_id,
            )
        ).scalar_one_or_none()
        if already_exists is not None:
            skipped += 1
            continue

        media_path = ""
        media_hash = ""
        if msg.image_srcs:
            image_bytes = download_image_bytes(page, msg.image_srcs[0])
            media_hash = hashlib.sha256(image_bytes).hexdigest()
            media_dir.mkdir(parents=True, exist_ok=True)
            dest = media_dir / f"{msg.message_id}.jpg"
            dest.write_bytes(image_bytes)
            media_path = str(dest)

        if msg.is_outgoing and not msg.image_srcs:
            # Mensagem de texto enviada pela própria conta administrativa
            # (não um promotor) — nunca é relato de visita, é só a equipe
            # respondendo no grupo (ex.: "Consegue sim, muito obrigada").
            # Ignorada direto, sem passar pelo resolver/matcher de lojas.
            status = "ignored"
        else:
            status = "pending" if msg.message_timestamp is not None else "needs_review"

        session.add(
            ProcessedMessage(
                project=project,
                message_id=msg.message_id,
                media_hash=media_hash,
                media_path=media_path,
                chat_group=chat_group,
                sender_name=msg.sender_name or "",
                sender_phone=msg.sender_phone,
                caption=msg.caption,
                message_timestamp=msg.message_timestamp,
                status=status,
            )
        )
        saved += 1

    return saved, skipped
