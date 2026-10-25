/**
 * Importação "Atendimentos via parceiros": uma linha por loja × marca atendida
 * por um parceiro (outra empresa ou responsável). Cadastra, quando faltam, a
 * rede, a loja e a marca (sem produtos: os SKUs entram depois pela importação
 * de produtos), grava o parceiro na loja × marca e, se o promotor já tem
 * usuário na agência, cria a atribuição dele com a frequência da planilha.
 *
 * Reimportar a mesma planilha não duplica nada: loja × marca e atribuição são
 * atualizadas. Promotor ainda sem usuário não bloqueia a linha — a loja × marca
 * entra e o aviso diz o que falta (rodar de novo depois de importar os promotores).
 */
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { saveBrand, saveChain, saveStore } from "./admin";
import { saveTarget, syncPromoterSchedules } from "./portfolio";
import type { ImportReport } from "./import";
import type { TargetPeriod } from "@/lib/portfolio";

type Row = Record<string, string>;

const clean = (v: string | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const key = (v: string) => clean(v).toLowerCase();

/** Identificador da marca a partir do nome (só letras e números, maiúsculas). */
export function brandCodeFromName(name: string): string {
  return clean(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
}

/** "1", "2" = vezes por semana; "mensal" = 1 por mês; vazio ou "-" = sem frequência. */
export function parseFrequency(raw: string | undefined): { times: number; period: TargetPeriod } | null | "invalid" {
  const v = clean(raw).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!v || v === "-") return null;
  if (/mens/.test(v)) return { times: 1, period: "month" };
  if (/quinz/.test(v)) return { times: 1, period: "fortnight" };
  const n = Number(v.replace(",", "."));
  return Number.isInteger(n) && n >= 1 && n <= 14 ? { times: n, period: "week" } : "invalid";
}

const NO_PROMOTER = /^(s\/?\s*promotor|sem promotor|-)$/i;

export async function importPartners(scope: Scope, rows: Row[], report: ImportReport): Promise<void> {
  const db = await getDb();
  const dryRun = report.dryRun;
  const notes = (report.notes ??= []);
  const seen = new Map<string, number>();
  const syncPromoters = new Set<string>();
  // Cadastros criados nesta importação (na validação nada é gravado, mas a contagem fica certa).
  const pendingChains = new Set<string>();
  const pendingBrands = new Set<string>();

  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    const rede = clean(r.rede);
    const loja = clean(r.loja);
    const cidade = clean(r.cidade);
    const marca = clean(r.marca).replace(/\s+\.$/, "");
    const parceiro = clean(r.parceiro);
    const responsavel = clean(r.responsavel);
    const contato = clean(r.contato);
    const promotor = clean(r.promotor);
    if (!loja || !marca || !cidade) {
      report.errors.push({ line, message: "Registro incompleto: loja, marca e cidade são obrigatórias." });
      continue;
    }
    if (!parceiro && !responsavel) {
      report.errors.push({ line, message: "Informe o parceiro ou o responsável do parceiro." });
      continue;
    }
    const freq = parseFrequency(r.frequencia);
    if (freq === "invalid") {
      report.errors.push({ line, message: `Frequência “${r.frequencia}” inválida (1, 2… por semana, ou mensal).` });
      continue;
    }
    const dupKey = `${key(rede)}|${key(loja)}|${key(marca)}`;
    const first = seen.get(dupKey);
    if (first) {
      report.errors.push({ line, message: `Duplicado: ${loja} × ${marca} já está na linha ${first} (linha ignorada).` });
      continue;
    }
    seen.set(dupKey, line);

    // Rede
    let chainId: string | null = null;
    if (rede) {
      const [chain] = await db.select().from(s.chains).where(and(eq(s.chains.agencyId, scope.agencyId), sql`lower(${s.chains.name}) = ${key(rede)}`));
      if (chain) chainId = chain.id;
      else if (!dryRun) {
        const res = await saveChain(scope, null, rede, "active");
        if (!res.ok) {
          report.errors.push({ line, message: `Rede “${rede}”: ${res.error}` });
          continue;
        }
        const [c] = await db.select().from(s.chains).where(and(eq(s.chains.agencyId, scope.agencyId), sql`lower(${s.chains.name}) = ${key(rede)}`));
        chainId = c?.id ?? null;
      } else pendingChains.add(key(rede));
    }

    // Loja (rede + nome)
    const storeWhere = and(eq(s.stores.agencyId, scope.agencyId), chainId ? eq(s.stores.chainId, chainId) : sql`${s.stores.chainId} is null`, sql`lower(${s.stores.name}) = ${key(loja)}`);
    let [store] = rede && !chainId ? [] : await db.select({ id: s.stores.id }).from(s.stores).where(storeWhere);
    if (!store && !dryRun) {
      const res = await saveStore(scope, { id: null, chainId, name: loja, code: null, cnpj: null, address: null, district: null, city: cidade, state: "MG", status: "active", brandIds: [], rules: null, notes: null });
      if (!res.ok) {
        report.errors.push({ line, message: `Loja “${loja}”: ${res.error}` });
        continue;
      }
      [store] = await db.select({ id: s.stores.id }).from(s.stores).where(storeWhere);
    }

    // Marca (identificador ou nome)
    const code = brandCodeFromName(marca);
    const brandWhere = and(eq(s.brands.agencyId, scope.agencyId), sql`(lower(${s.brands.code}) = ${code.toLowerCase()} or lower(${s.brands.name}) = ${key(marca)})`);
    let [brand] = await db.select({ id: s.brands.id }).from(s.brands).where(brandWhere);
    if (!brand && !dryRun) {
      const res = await saveBrand(scope, { id: null, name: marca, code, status: "active", minBeforePhotos: 1, minAfterPhotos: 1, requireStock: true, rupturePhotoRequired: false, allowGallery: true, activities: [], notes: null });
      if (!res.ok) {
        report.errors.push({ line, message: `Marca “${marca}”: ${res.error}` });
        continue;
      }
      [brand] = await db.select({ id: s.brands.id }).from(s.brands).where(brandWhere);
    }
    if (!brand && !pendingBrands.has(code)) notes.push({ line, message: `Marca nova: ${marca} (sem SKUs — complete depois em Importar › Produtos).` });
    if (!brand) pendingBrands.add(code);

    // Parceiro
    const partnerName = parceiro || responsavel;
    let [partner] = await db.select({ id: s.partners.id }).from(s.partners).where(and(eq(s.partners.agencyId, scope.agencyId), sql`lower(${s.partners.name}) = ${key(partnerName)}`));
    if (!partner && !dryRun) {
      [partner] = await db
        .insert(s.partners)
        .values({ agencyId: scope.agencyId, name: partnerName, contactName: responsavel || null, phone: contato || null, createdBy: scope.userId, updatedBy: scope.userId })
        .onConflictDoNothing()
        .returning({ id: s.partners.id });
      if (!partner) [partner] = await db.select({ id: s.partners.id }).from(s.partners).where(and(eq(s.partners.agencyId, scope.agencyId), sql`lower(${s.partners.name}) = ${key(partnerName)}`));
    }

    // Loja × marca com o parceiro (sem duplicar)
    const [link] = store && brand ? await db.select().from(s.storeBrands).where(and(eq(s.storeBrands.storeId, store.id), eq(s.storeBrands.brandId, brand.id))) : [];
    if (!dryRun && store && brand && partner) {
      const values = { partnerId: partner.id, visitsPerPeriod: freq?.times ?? null, period: freq?.period ?? null };
      await db.insert(s.storeBrands).values({ storeId: store.id, brandId: brand.id, ...values }).onConflictDoUpdate({ target: [s.storeBrands.storeId, s.storeBrands.brandId], set: values });
    }
    if (link) report.updated++;
    else report.created++;

    // Promotor (opcional)
    if (!promotor || NO_PROMOTER.test(promotor)) continue;
    const [user] = await db.select({ id: s.users.id, role: s.users.role }).from(s.users).where(and(eq(s.users.agencyId, scope.agencyId), sql`lower(${s.users.username}) = ${promotor.toLowerCase()}`));
    if (!user || user.role !== "promoter") {
      notes.push({ line, message: `Promotor “${promotor}” sem usuário nesta agência: ${loja} × ${marca} entrou sem promotor. Importe os promotores e rode esta planilha de novo.` });
      continue;
    }
    if (!freq) {
      notes.push({ line, message: `${loja} × ${marca}: sem frequência, a atribuição do promotor não foi criada.` });
      continue;
    }
    if (dryRun || !store || !brand) continue;
    const res = await saveTarget(scope, { promoterId: user.id, storeId: store.id, brandId: brand.id, perWeek: freq.times, period: freq.period, weekdays: [] }, { sync: false });
    if (!res.ok) report.errors.push({ line, message: `Atribuição de ${promotor}: ${res.error}` });
    else syncPromoters.add(user.id);
  }
  if (pendingChains.size) notes.unshift({ line: 0, message: `${pendingChains.size} rede(s) nova(s): serão criadas.` });
  if (syncPromoters.size) await syncPromoterSchedules(scope.agencyId, scope.userId, [...syncPromoters]);
}
