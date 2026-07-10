"""Sessão do WhatsApp Web via Playwright.

Usa um "persistent context" (perfil de navegador salvo em disco) para que o
login por QR code só precise ser feito uma vez. Nas próximas execuções, o
WhatsApp Web já abre logado.
"""
from __future__ import annotations

from playwright.sync_api import BrowserContext, Page, Playwright
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

from core.config.settings import settings

WHATSAPP_URL = "https://web.whatsapp.com"

# "#pane-side" é a lista de conversas — só existe quando a sessão está logada.
# Esse seletor é estrutural (não depende de idioma nem de texto), por isso é
# a forma mais estável de detectar login, mesmo que o layout mude visualmente.
LOGGED_IN_SELECTOR = "#pane-side"


def launch_context(playwright: Playwright, headless: bool = False) -> BrowserContext:
    settings.whatsapp_session_dir.mkdir(parents=True, exist_ok=True)
    return playwright.chromium.launch_persistent_context(
        user_data_dir=str(settings.whatsapp_session_dir),
        headless=headless,
        viewport={"width": 1280, "height": 900},
        # Usa o Google Chrome já instalado no sistema em vez do Chromium baixado
        # pelo Playwright: nesta máquina o Chromium standalone falha ao iniciar
        # (erro de side-by-side assembly do Windows).
        channel="chrome",
    )


def open_whatsapp(context: BrowserContext) -> Page:
    page = context.pages[0] if context.pages else context.new_page()
    page.goto(WHATSAPP_URL)
    return page


def is_logged_in(page: Page) -> bool:
    return page.locator(LOGGED_IN_SELECTOR).count() > 0


def wait_for_login(page: Page, timeout_seconds: int = 90) -> bool:
    """Aguarda até a lista de conversas aparecer (QR code escaneado)."""
    try:
        page.wait_for_selector(LOGGED_IN_SELECTOR, timeout=timeout_seconds * 1000)
        return True
    except PlaywrightTimeoutError:
        return False
