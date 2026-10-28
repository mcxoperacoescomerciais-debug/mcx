/**
 * Excel de qualquer tela do painel: recebe as tabelas e indicadores lidos da
 * própria tela (botão "Exportar Excel") e devolve a planilha formatada.
 */
import { getApiScope, unauthorized } from "@/server/auth";
import { audit } from "@/server/audit";
import { buildWorkbook, xlsxResponse, type SheetSpec } from "@/server/xlsx";

const MAX_CELLS = 2_000_000;

export async function POST(request: Request) {
  const scope = await getApiScope(["admin", "manager"]);
  if (!scope) return unauthorized();
  const b = (await request.json().catch(() => null)) as { title?: unknown; subtitle?: unknown; path?: unknown; query?: unknown; sheets?: unknown } | null;
  const sheets = Array.isArray(b?.sheets) ? (b!.sheets as { name?: unknown; columns?: unknown; rows?: unknown }[]).slice(0, 40) : [];
  const title = typeof b?.title === "string" ? b.title.slice(0, 120) : "Relatório";
  let cells = 0;
  const used = new Set<string>();
  const specs: SheetSpec[] = [];
  for (const s of sheets) {
    const columns = Array.isArray(s.columns) ? s.columns.map((c) => String(c ?? "").slice(0, 80)).slice(0, 60) : [];
    const rows = Array.isArray(s.rows) ? (s.rows as unknown[]).filter(Array.isArray).map((r) => (r as unknown[]).slice(0, columns.length).map((v) => String(v ?? "").slice(0, 2000))) : [];
    cells += rows.length * columns.length;
    if (cells > MAX_CELLS) return Response.json({ error: "Relatório grande demais: aplique um filtro (período, marca ou loja) e exporte de novo." }, { status: 413 });
    if (!columns.length) continue;
    // Nome de aba: até 31 caracteres, sem caracteres proibidos, sem repetir.
    let name = String(s.name ?? "Dados").replace(/[\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Dados";
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${name.slice(0, 26)} ${n}`;
    used.add(name.toLowerCase());
    const keys = columns.map((_, i) => `c${i}`);
    specs.push({
      name,
      columns: columns.map((header, i) => ({ header, key: keys[i], width: Math.min(60, Math.max(12, header.length + 4, ...rows.slice(0, 200).map((r) => (r[i] ?? "").length + 2))) })),
      rows: rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, asValue(r[i] ?? "")]))),
    });
  }
  if (!specs.length) return Response.json({ error: "Nada para exportar nesta tela." }, { status: 400 });
  const subtitle = typeof b?.subtitle === "string" ? b.subtitle.slice(0, 300) : "";
  if (subtitle) specs[0].note = `${title} · ${subtitle} · exportado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "export", scope.agencyId, "page_export", { after: { title, path: String(b?.path ?? "").slice(0, 200), query: String(b?.query ?? "").slice(0, 400), sheets: specs.length } });
  return xlsxResponse(await buildWorkbook(specs, { agency: scope.agencyName, title }), `${title}.xlsx`);
}

/** Número puro ("12", "1.234,5", "R$ 10,00", "45%") vira número no Excel; o resto fica texto. */
function asValue(v: string): string | number {
  const t = v.trim();
  const m = /^(-|−)?\s*(R\$\s*)?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?\s*%?$/.exec(t);
  if (!m || /^0\d/.test(t.replace(/^R\$\s*/, ""))) return v;
  const n = Number(t.replace(/[−]/g, "-").replace(/R\$\s*/, "").replace(/%$/, "").replace(/\./g, "").replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : v;
}
