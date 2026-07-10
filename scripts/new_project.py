"""Cria a configuração de um novo projeto a partir do modelo do Café.

Assume a mesma estrutura de colunas (REDE, MARCA, CIDADE, ... MÊS/ANO) e a
mesma planilha — o normal quando é um novo grupo/responsável dentro do
mesmo arquivo do cliente. Se a estrutura for diferente, edite o YAML gerado
à mão depois.

Uso:
    python scripts/new_project.py <chave> <nome_exibicao> <grupo_whatsapp> <aba_planilha> [spreadsheet_id]

Exemplo:
    python scripts/new_project.py barao "Barão" "Grupo Barão Promotores" "Barão"
"""
import sys

import yaml

from core.config.settings import PROJECTS_DIR, load_project_config


def main() -> None:
    if len(sys.argv) < 5:
        print(__doc__)
        sys.exit(1)

    key, display_name, group_name, worksheet_name = sys.argv[1:5]
    spreadsheet_id = sys.argv[5] if len(sys.argv) > 5 else None

    template = load_project_config("cafe")

    new_config = dict(template)
    new_config["project"] = key
    new_config["display_name"] = display_name
    new_config["whatsapp"] = {"group_name": group_name}
    new_config["sheets"] = dict(template["sheets"])
    new_config["sheets"]["worksheet_name"] = worksheet_name
    if spreadsheet_id:
        new_config["sheets"]["spreadsheet_id"] = spreadsheet_id

    out_path = PROJECTS_DIR / f"{key}.yaml"
    if out_path.exists():
        print(f"Já existe {out_path}. Apague-o primeiro se quiser recriar.")
        sys.exit(1)

    with open(out_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(new_config, f, allow_unicode=True, sort_keys=False)

    print(f"Criado {out_path}")
    print("Confira o cabeçalho da aba (linha do título, linha de colunas) antes de usar:")
    print(f"  python scripts/check_sheets_connection.py {key}")


if __name__ == "__main__":
    main()
