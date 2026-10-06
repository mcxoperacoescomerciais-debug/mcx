/**
 * Exporta as ocorrências do período/filtros do painel para Excel (padrão) ou
 * CSV (?formato=csv). Mesmos filtros da URL do dashboard.
 */
import ExcelJS from "exceljs";
import { getApiScope, MANAGER_ROLES, unauthorized } from "@/server/auth";
import { loadFacts } from "@/server/analytics";
import { parseFilters, resolveRange } from "@/lib/filters";
import { DAMAGE_KIND_LABEL, LOCATION_LABEL, OCCURRENCE_STATUS_LABEL, OCCURRENCE_TYPE_LABEL, RUPTURE_KIND_LABEL, SEVERITY_LABEL } from "@/lib/domain";
import { formatIsoBr } from "@/lib/validity";

const COLUMNS = [
  { header: "Data da visita", key: "visitDate", width: 14 },
  { header: "Rede", key: "network", width: 14 },
  { header: "Loja", key: "store", width: 26 },
  { header: "Cidade", key: "city", width: 16 },
  { header: "Promotor", key: "promoter", width: 20 },
  { header: "Tipo", key: "type", width: 12 },
  { header: "Local", key: "location", width: 15 },
  { header: "Produto", key: "product", width: 36 },
  { header: "Categoria", key: "category", width: 18 },
  { header: "Quantidade", key: "quantity", width: 11 },
  { header: "Unidade", key: "unit", width: 9 },
  { header: "Validade", key: "expiry", width: 12 },
  { header: "Dias p/ vencer (na visita)", key: "days", width: 14 },
  { header: "Classificação", key: "severity", width: 15 },
  { header: "Situação ruptura/avaria", key: "kind", width: 22 },
  { header: "Status", key: "status", width: 12 },
  { header: "Observação", key: "notes", width: 40 },
];

export async function GET(request: Request) {
  const scope = await getApiScope(MANAGER_ROLES);
  if (!scope) return unauthorized();
  const url = new URL(request.url);
  const filters = parseFilters(Object.fromEntries(url.searchParams));
  const range = resolveRange(filters);
  const facts = (await loadFacts(scope, filters, range.from, range.to)).sort((a, b) => b.visitDate.localeCompare(a.visitDate));
  const rows = facts.map((x) => ({
    visitDate: formatIsoBr(x.visitDate),
    network: x.networkName,
    store: `${x.storeName}${x.storeCode ? ` ${x.storeCode}` : ""}`,
    city: x.city,
    promoter: x.promoterName,
    type: OCCURRENCE_TYPE_LABEL[x.type],
    location: x.type === "validity" ? LOCATION_LABEL[x.location as keyof typeof LOCATION_LABEL] : "",
    product: x.productName,
    category: x.category,
    quantity: x.quantity ?? "",
    unit: x.unit,
    expiry: x.expiryDate ? formatIsoBr(x.expiryDate) : "",
    days: x.daysToExpiry ?? "",
    severity: x.severity ? SEVERITY_LABEL[x.severity] : "",
    kind: x.ruptureKind ? RUPTURE_KIND_LABEL[x.ruptureKind as keyof typeof RUPTURE_KIND_LABEL] : x.damageKind ? DAMAGE_KIND_LABEL[x.damageKind as keyof typeof DAMAGE_KIND_LABEL] : "",
    status: OCCURRENCE_STATUS_LABEL[x.status],
    notes: x.notes ?? "",
  }));
  const stamp = `${range.from}_a_${range.to}`;

  if (url.searchParams.get("formato") === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [COLUMNS.map((c) => esc(c.header)).join(";"), ...rows.map((r) => COLUMNS.map((c) => esc(r[c.key as keyof typeof r])).join(";"))].join("\r\n");
    // BOM para o Excel brasileiro abrir com acentos corretos.
    return new Response(`﻿${csv}`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="suinco_ocorrencias_${stamp}.csv"` },
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "MCX · SUINCO Gestão de Loja";
  const ws = wb.addWorksheet("Ocorrências", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS;
  ws.addRows(rows);
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1236" } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="suinco_ocorrencias_${stamp}.xlsx"`,
    },
  });
}
