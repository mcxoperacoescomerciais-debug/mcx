import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

from core.sheets.client import get_gspread_client

SPREADSHEETS = {
    "10eVqEdzrceWBiMpGY51s6KcLJsVE4dphdo0t_S0p8bg": "Helvecio_Roteiro_Promotores",
    "1JcymgFXz4OGH1g08DUtkTVjV5lq2uW-Zgh4tsn5Vca4": "Lucas_Roteiro_Promotores",
}

client = get_gspread_client()
result = {}

for spreadsheet_id, label in SPREADSHEETS.items():
    ss = client.open_by_key(spreadsheet_id)
    result[label] = {}
    for ws in ss.worksheets():
        if ws.title in ("Listas", "RESUMO"):
            continue
        values = ws.get_all_values()
        if len(values) < 3:
            continue
        header = values[1]
        try:
            rede_idx = header.index("REDE")
            cidade_idx = header.index("CIDADE")
            marca_idx = header.index("MARCA")
        except ValueError:
            result[label][ws.title] = {"error": f"cabeçalho inesperado: {header}"}
            continue

        seen = {}
        for row in values[2:]:
            if len(row) <= rede_idx or not row[rede_idx].strip():
                continue
            rede = row[rede_idx].strip()
            cidade = row[cidade_idx].strip() if len(row) > cidade_idx else ""
            marca = row[marca_idx].strip() if len(row) > marca_idx else ""
            seen[(rede, cidade)] = marca
        stores = sorted(
            [{"rede": r, "cidade": c, "marca": m} for (r, c), m in seen.items()],
            key=lambda x: x["rede"],
        )
        result[label][ws.title] = stores

with open("data/all_stores_dump.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

total = sum(len(v) for sheet in result.values() for v in sheet.values() if isinstance(v, list))
print(f"Salvo em data/all_stores_dump.json — {total} lojas distintas no total")
for label, tabs in result.items():
    print(f"\n{label}:")
    for tab, stores in tabs.items():
        count = len(stores) if isinstance(stores, list) else "ERRO"
        print(f"  {tab}: {count}")
