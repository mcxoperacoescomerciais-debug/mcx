"""Login inicial no WhatsApp Web. Só precisa rodar uma vez.

Abre uma janela de navegador de verdade — escaneie o QR code com o WhatsApp
do celular (Configurações > Aparelhos conectados > Conectar um aparelho).
A sessão fica salva em data/sessions, então da próxima vez já abre logado.

Uso:
    python scripts/run_whatsapp_login.py
"""
import sys

from playwright.sync_api import sync_playwright

from core.whatsapp.client import launch_context, open_whatsapp, wait_for_login

sys.stdout.reconfigure(encoding="utf-8")

# Dá um tempo curto pro WhatsApp Web carregar a sessão já salva antes de
# assumir que precisa mostrar QR code novo (o "#pane-side" não aparece
# instantaneamente mesmo quando a sessão já está válida).
QUICK_CHECK_SECONDS = 8


def main() -> None:
    with sync_playwright() as p:
        context = launch_context(p, headless=False)
        page = open_whatsapp(context)

        if wait_for_login(page, timeout_seconds=QUICK_CHECK_SECONDS):
            print("Sessão já estava logada. Nada a fazer.")
            context.close()
            return

        print("Aguardando leitura do QR code (escaneie com o WhatsApp do celular)...")
        if wait_for_login(page, timeout_seconds=90):
            print("Login realizado com sucesso! Sessão salva em data/sessions.")
        else:
            print("Tempo esgotado esperando o login. Rode o script novamente.")

        context.close()


if __name__ == "__main__":
    main()
