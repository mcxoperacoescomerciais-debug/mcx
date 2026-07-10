"""Reprocessa (sem gravar no banco) as mensagens de um grupo e mostra
sender_name/caption já limpos, para confirmar a correção do coletor
(cartão de contato / mensagem citada / mensagens de saída).

Uso:
    python scripts/_verify_collector_fix.py <project_key> "<trecho do texto>"
"""
import sys

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright

from core.config.settings import load_project_config
from core.whatsapp.client import launch_context, open_whatsapp, wait_for_login
from core.whatsapp.collector import extract_messages, open_group


def main() -> None:
    project = sys.argv[1]
    needle = sys.argv[2] if len(sys.argv) > 2 else None
    config = load_project_config(project)
    group_name = config["whatsapp"]["group_name"]

    with sync_playwright() as p:
        context = launch_context(p, headless=True)
        page = open_whatsapp(context)
        if not wait_for_login(page, timeout_seconds=15):
            print("Sessão não logada.")
            return
        if not open_group(page, group_name):
            print(f"Não consegui abrir o grupo '{group_name}'.")
            return

        messages = extract_messages(page)
        shown = 0
        for msg in messages:
            if needle and (not msg.caption or needle not in msg.caption):
                continue
            shown += 1
            print(f"id={msg.message_id} outgoing={msg.is_outgoing}")
            print(f"  sender_name={msg.sender_name!r} sender_phone={msg.sender_phone!r}")
            print(f"  caption={msg.caption!r}")
            print()
        print(f"{shown} mensagem(ns) mostrada(s) de {len(messages)} carregadas.")
        context.close()


if __name__ == "__main__":
    main()
