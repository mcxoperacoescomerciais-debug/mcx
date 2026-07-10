"""Coleta as mensagens do grupo do WhatsApp configurado e salva as novas no banco.

Uso:
    python scripts/run_whatsapp_collector.py cafe
"""
import sys

from playwright.sync_api import sync_playwright

from core.config.settings import load_project_config, settings
from core.db.session import get_session
from core.whatsapp.client import launch_context, open_whatsapp, wait_for_login
from core.whatsapp.collector import extract_messages, open_group, save_new_messages

sys.stdout.reconfigure(encoding="utf-8")


def main() -> None:
    project = sys.argv[1] if len(sys.argv) > 1 else "cafe"
    config = load_project_config(project)
    group_name = config["whatsapp"]["group_name"]

    with sync_playwright() as p:
        context = launch_context(p, headless=False)
        page = open_whatsapp(context)

        if not wait_for_login(page, timeout_seconds=15):
            print("Sessão não está logada. Rode primeiro scripts/run_whatsapp_login.py")
            context.close()
            return

        print(f"Abrindo grupo '{group_name}'...")
        if not open_group(page, group_name):
            print(f"Não consegui abrir/carregar o grupo '{group_name}'.")
            context.close()
            return

        messages = extract_messages(page)
        print(f"{len(messages)} mensagens carregadas na tela.")

        with get_session() as session:
            saved, skipped = save_new_messages(
                session=session,
                page=page,
                project=project,
                chat_group=group_name,
                messages=messages,
                media_dir=settings.media_dir,
            )

        print(f"Novas: {saved} | Já processadas antes: {skipped}")
        context.close()


if __name__ == "__main__":
    main()
