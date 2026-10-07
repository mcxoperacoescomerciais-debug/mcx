/**
 * Serviços do app do promotor: catálogo para uso offline, sincronização das
 * visitas e histórico. Todas as funções recebem o escopo do promotor logado e
 * só tocam em lojas atribuídas a ele.
 */
import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { getClientSettings } from "./settings";
import { audit, diffFields } from "./audit";
import { notifyCriticalVisit } from "./whatsapp-alert";
import { addDays, classify, daysBetween, todayIso } from "@/lib/validity";
import type {
  BootstrapPayload,
  OccurrenceInput,
  PromoterVisitSummary,
  SyncResult,
  VisitInput,
} from "@/lib/sync-types";

export async function getAssignedStoreIds(scope: Scope): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: s.stores.id })
    .from(s.storeAssignments)
    .innerJoin(s.stores, eq(s.stores.id, s.storeAssignments.storeId))
    .where(and(eq(s.storeAssignments.userId, scope.userId), eq(s.stores.clientId, scope.clientId), eq(s.stores.status, "active")));
  return rows.map((r) => r.id);
}

export async function getBootstrap(scope: Scope): Promise<BootstrapPayload> {
  const db = await getDb();
  const today = todayIso();

  // O banco fica em São Paulo e o servidor nos EUA: cada consulta custa uma ida e
  // volta. As independentes vão juntas (3 rodadas em vez de 9 em sequência).
  const [settings, [user], [client], storeRows, products] = await Promise.all([
    getClientSettings(scope.clientId),
    db.select().from(s.users).where(eq(s.users.id, scope.userId)),
    db.select().from(s.clients).where(eq(s.clients.id, scope.clientId)),
    db
      .select({
        id: s.stores.id,
        name: s.stores.name,
        code: s.stores.code,
        city: s.stores.city,
        state: s.stores.state,
        format: s.stores.format,
        networkId: s.stores.networkId,
        network: s.networks.name,
      })
      .from(s.storeAssignments)
      .innerJoin(s.stores, eq(s.stores.id, s.storeAssignments.storeId))
      .innerJoin(s.networks, eq(s.networks.id, s.stores.networkId))
      .where(and(eq(s.storeAssignments.userId, scope.userId), eq(s.stores.clientId, scope.clientId), eq(s.stores.status, "active")))
      .orderBy(s.stores.city, s.stores.name),
    db
      .select({
        id: s.products.id,
        name: s.products.name,
        code: s.products.code,
        category: s.products.category,
        presentation: s.products.presentation,
        defaultUnit: s.products.defaultUnit,
        aliases: s.products.aliases,
        referencePrice: s.products.referencePrice,
      })
      .from(s.products)
      .where(and(eq(s.products.clientId, scope.clientId), eq(s.products.status, "active")))
      .orderBy(s.products.name),
  ]);
  const storeIds = storeRows.map((r) => r.id);
  const networkIds = [...new Set(storeRows.map((r) => r.networkId))];

  const [lastVisits, officialMix, seenRows] = await Promise.all([
    storeIds.length
      ? db
          .selectDistinctOn([s.visits.storeId], { storeId: s.visits.storeId, id: s.visits.id, visitDate: s.visits.visitDate })
          .from(s.visits)
          .where(and(inArray(s.visits.storeId, storeIds), eq(s.visits.status, "finished")))
          .orderBy(s.visits.storeId, desc(s.visits.visitDate), desc(s.visits.startedAt))
      : [],
    // Mix oficial (planilhas de MIX por rede + formato), na ordem da planilha.
    networkIds.length
      ? db
          .select({ networkId: s.productMixes.networkId, format: s.productMixes.format, productId: s.productMixes.productId, chainCode: s.productMixes.chainCode })
          .from(s.productMixes)
          .where(inArray(s.productMixes.networkId, networkIds))
          .orderBy(s.productMixes.seq)
      : [],
    // Produtos fora do mix que já apareceram na loja (últimos 90 dias) entram no fim da lista.
    storeIds.length
      ? db
          .selectDistinct({ storeId: s.occurrences.storeId, productId: s.occurrences.productId })
          .from(s.occurrences)
          .innerJoin(s.visits, eq(s.visits.id, s.occurrences.visitId))
          .where(and(inArray(s.occurrences.storeId, storeIds), gte(s.visits.visitDate, addDays(today, -90))))
      : [],
  ]);
  const lastVisitIds = lastVisits.map((v) => v.id);

  const lastItems = lastVisitIds.length
    ? await db
        .select({
          visitId: s.occurrences.visitId,
          productId: s.occurrences.productId,
          type: s.occurrences.type,
          location: s.occurrences.location,
          unit: s.occurrences.unit,
        })
        .from(s.occurrences)
        .where(and(inArray(s.occurrences.visitId, lastVisitIds), sql`${s.occurrences.deletedAt} is null`))
    : [];

  return {
    serverToday: today,
    user: { id: user.id, name: user.name, username: user.username },
    client: { id: client.id, name: client.name },
    bands: settings.bands,
    checklist: settings.checklist,
    editWindowHours: settings.promoterEditHours,
    products: products.map((p) => ({ ...p, referencePrice: p.referencePrice === null ? null : Number(p.referencePrice) })),
    stores: storeRows.map(({ networkId, ...st }) => {
      const last = lastVisits.find((v) => v.storeId === st.id);
      const seen = new Set<string>();
      const networkMix = officialMix.filter((m) => m.networkId === networkId);
      const formatOptions = [...new Set(networkMix.map((m) => m.format))];
      const mixByFormat = Object.fromEntries(formatOptions.map((f) => [f, networkMix.filter((m) => m.format === f).map((m) => m.productId)]));
      const chainCodesByFormat = Object.fromEntries(
        formatOptions.map((f) => [f, Object.fromEntries(networkMix.filter((m) => m.format === f && m.chainCode).map((m) => [m.productId, m.chainCode!]))]),
      );
      const seenProducts = seenRows.filter((m) => m.storeId === st.id).map((m) => m.productId);
      // Rede com um só formato (ex.: BH) não precisa de escolha: usa esse formato.
      const format = formatOptions.length === 1 ? formatOptions[0] : formatOptions.includes(st.format) ? st.format : "";
      return {
        ...st,
        format,
        formatOptions,
        lastVisitDate: last?.visitDate ?? null,
        mix: [...new Set([...(mixByFormat[format] ?? []), ...seenProducts])],
        chainCodes: chainCodesByFormat[format] ?? {},
        mixByFormat,
        chainCodesByFormat,
        seenProducts,
        lastItems: lastItems
          .filter((i) => i.visitId === last?.id)
          .filter((i) => {
            const k = `${i.productId}|${i.type}|${i.location}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .map(({ productId, type, location, unit }) => ({ productId, type, location, unit })),
      };
    }),
  };
}

/** Campos comparados para decidir se houve alteração (e auditar). */
const TRACKED_FIELDS = [
  "productId", "type", "location", "quantity", "unit", "expiryDate", "lot", "price", "ruptureKind", "damageKind", "notes",
] as const;

function normalizeOccurrence(o: OccurrenceInput) {
  return {
    productId: o.productId,
    type: o.type,
    location: o.type === "validity" ? o.location : o.location ?? "sales_floor",
    quantity: o.quantity ?? null,
    unit: o.unit,
    expiryDate: o.type === "validity" || o.type === "damage" ? o.expiryDate ?? null : null,
    lot: o.lot?.trim() || null,
    price: o.price === null || o.price === undefined ? null : o.price.toFixed(2),
    ruptureKind: o.type === "rupture" ? o.ruptureKind ?? "total" : null,
    damageKind: o.type === "damage" ? o.damageKind ?? "other" : null,
    notes: o.notes?.trim() || null,
  };
}

function validateOccurrence(o: ReturnType<typeof normalizeOccurrence>): string | null {
  if (o.type === "validity" && (!o.expiryDate || !o.quantity)) return "Validade e quantidade são obrigatórias.";
  if (o.type === "damage" && !o.quantity) return "Quantidade da avaria é obrigatória.";
  if (o.expiryDate) {
    const [y, m, d] = o.expiryDate.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "Data de validade inválida.";
  }
  return null;
}

export async function syncVisit(scope: Scope, input: VisitInput): Promise<SyncResult> {
  const db = await getDb();
  const today = todayIso();
  const [settings, assigned] = await Promise.all([getClientSettings(scope.clientId), getAssignedStoreIds(scope)]);
  if (!assigned.includes(input.storeId)) return { visitId: input.id, ok: false, error: "Loja não atribuída a você." };
  if (daysBetween(input.visitDate, today) < -1 || daysBetween(input.visitDate, today) > 30) {
    return { visitId: input.id, ok: false, error: "Data da visita fora do permitido." };
  }

  const productIds = [...new Set(input.occurrences.map((o) => o.productId))];
  if (productIds.length) {
    const valid = await db
      .select({ id: s.products.id })
      .from(s.products)
      .where(and(eq(s.products.clientId, scope.clientId), inArray(s.products.id, productIds)));
    if (valid.length !== productIds.length) return { visitId: input.id, ok: false, error: "Produto inválido." };
  }

  // Auditoria gravada depois do commit: no PGlite (conexão única) gravar fora
  // da transação enquanto ela está aberta travaria.
  const auditQueue: Parameters<typeof audit>[] = [];
  const actor = { tenantId: scope.tenantId, userId: scope.userId };
  try {
    const result = await db.transaction(async (tx): Promise<SyncResult> => {
      const [existing] = await tx.select().from(s.visits).where(eq(s.visits.id, input.id));
      if (existing && (existing.promoterId !== scope.userId || existing.clientId !== scope.clientId)) {
        return { visitId: input.id, ok: false, error: "Visita pertence a outro usuário." };
      }
      const locked =
        existing?.status === "finished" &&
        existing.finishedAt !== null &&
        Date.now() - existing.finishedAt.getTime() > settings.promoterEditHours * 3_600_000;

      const visitValues = {
        storeId: input.storeId,
        visitDate: input.visitDate,
        startedAt: new Date(input.startedAt),
        finishedAt: input.finishedAt ? new Date(input.finishedAt) : null,
        status: input.status,
        checklist: input.checklist,
        notes: input.notes?.trim() || null,
      };

      const existingOccs = existing
        ? await tx.select().from(s.occurrences).where(eq(s.occurrences.visitId, input.id))
        : [];
      const byId = new Map(existingOccs.map((o) => [o.id, o]));

      const changes: { id: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }[] = [];
      for (const raw of input.occurrences) {
        const occ = normalizeOccurrence(raw);
        const err = validateOccurrence(occ);
        if (err) return { visitId: input.id, ok: false, error: err };
        const prev = byId.get(raw.id);
        if (prev && prev.visitId !== input.id) return { visitId: input.id, ok: false, error: "Item inválido." };
        if (!prev) changes.push({ id: raw.id, before: null, after: occ });
        else {
          const prevComparable = Object.fromEntries(TRACKED_FIELDS.map((f) => [f, prev[f]]));
          const diff = diffFields(prevComparable, occ);
          if (diff || prev.deletedAt) changes.push({ id: raw.id, ...(diff ?? { before: {}, after: {} }) });
        }
      }
      const deletions = input.deletedOccurrenceIds.filter((id) => byId.has(id) && !byId.get(id)!.deletedAt);

      const visitChanged =
        !existing ||
        diffFields(
          { status: existing.status, checklist: existing.checklist, notes: existing.notes, finishedAt: existing.finishedAt },
          { status: visitValues.status, checklist: visitValues.checklist, notes: visitValues.notes, finishedAt: visitValues.finishedAt },
        ) !== null;

      if (locked && (changes.length || deletions.length || visitChanged)) {
        return { visitId: input.id, ok: false, error: "Visita finalizada há mais de 24h: peça a correção ao gestor." };
      }

      // Formato escolhido pelo promotor (ABC varejo/plus/cash) passa a valer para a loja,
      // desde que a rede tenha mix cadastrado para esse formato.
      if (input.storeFormat) {
        const [store] = await tx.select({ format: s.stores.format, networkId: s.stores.networkId }).from(s.stores).where(eq(s.stores.id, input.storeId));
        const [hasMix] = await tx
          .select({ id: s.productMixes.productId })
          .from(s.productMixes)
          .where(and(eq(s.productMixes.networkId, store.networkId), eq(s.productMixes.format, input.storeFormat)))
          .limit(1);
        if (hasMix && store.format !== input.storeFormat) {
          await tx.update(s.stores).set({ format: input.storeFormat, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.stores.id, input.storeId));
          auditQueue.push([actor, "store", input.storeId, "update", { format: store.format }, { format: input.storeFormat }]);
        }
      }

      if (!existing) {
        await tx.insert(s.visits).values({
          id: input.id,
          tenantId: scope.tenantId,
          clientId: scope.clientId,
          promoterId: scope.userId,
          ...visitValues,
          createdBy: scope.userId,
          updatedBy: scope.userId,
        });
      } else if (visitChanged) {
        await tx
          .update(s.visits)
          .set({ ...visitValues, updatedAt: new Date(), updatedBy: scope.userId })
          .where(eq(s.visits.id, input.id));
      }

      for (const raw of input.occurrences) {
        if (!changes.some((c) => c.id === raw.id)) continue;
        const occ = normalizeOccurrence(raw);
        // Classificação de vencimento só para validades; na avaria a validade é informativa.
        const days = occ.type === "validity" && occ.expiryDate ? daysBetween(input.visitDate, occ.expiryDate) : null;
        const values = {
          ...occ,
          daysToExpiry: days,
          severity: days === null ? null : classify(days, settings.bands),
          deletedAt: null,
          updatedAt: new Date(),
          updatedBy: scope.userId,
        };
        if (byId.has(raw.id)) {
          await tx.update(s.occurrences).set(values).where(eq(s.occurrences.id, raw.id));
        } else {
          await tx.insert(s.occurrences).values({
            id: raw.id,
            tenantId: scope.tenantId,
            clientId: scope.clientId,
            visitId: input.id,
            storeId: input.storeId,
            createdBy: scope.userId,
            ...values,
          });
        }
      }
      if (deletions.length) {
        await tx
          .update(s.occurrences)
          .set({ deletedAt: new Date(), updatedAt: new Date(), updatedBy: scope.userId })
          .where(inArray(s.occurrences.id, deletions));
      }

      // Auditoria só de alterações em itens que já existiam no servidor
      // (criação já fica registrada em created_at/created_by).
      for (const c of changes) if (c.before) auditQueue.push([actor, "occurrence", c.id, "update", c.before, c.after]);
      for (const id of deletions) auditQueue.push([actor, "occurrence", id, "delete"]);
      if (existing && existing.status !== "finished" && input.status === "finished") {
        auditQueue.push([actor, "visit", input.id, "finish"]);
      }
      return { visitId: input.id, ok: true };
    });
    for (const entry of auditQueue) await audit(...entry);
    // Alerta de validade crítica no WhatsApp da gestão (em segundo plano: não atrasa o envio do promotor).
    if (result.ok && input.status === "finished") void notifyCriticalVisit(scope, input.id);
    return result;
  } catch (err) {
    console.error("[sync] erro na visita", input.id, err);
    return { visitId: input.id, ok: false, error: "Erro ao salvar. Tentaremos novamente." };
  }
}

export async function listPromoterVisits(scope: Scope, days = 60): Promise<PromoterVisitSummary[]> {
  const db = await getDb();
  const since = addDays(todayIso(), -days);
  const o = s.occurrences;
  const rows = await db
    .select({
      id: s.visits.id,
      storeId: s.visits.storeId,
      storeName: s.stores.name,
      storeCode: s.stores.code,
      city: s.stores.city,
      visitDate: s.visits.visitDate,
      startedAt: s.visits.startedAt,
      finishedAt: s.visits.finishedAt,
      status: s.visits.status,
      validity: sql<number>`count(*) filter (where ${o.type} = 'validity' and ${o.location} <> 'stock')`.mapWith(Number),
      stock: sql<number>`count(*) filter (where ${o.type} = 'validity' and ${o.location} = 'stock')`.mapWith(Number),
      rupture: sql<number>`count(*) filter (where ${o.type} = 'rupture')`.mapWith(Number),
      damage: sql<number>`count(*) filter (where ${o.type} = 'damage')`.mapWith(Number),
      expired: sql<number>`count(*) filter (where ${o.severity} = 'expired')`.mapWith(Number),
      critical: sql<number>`count(*) filter (where ${o.severity} = 'critical')`.mapWith(Number),
    })
    .from(s.visits)
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .leftJoin(o, and(eq(o.visitId, s.visits.id), sql`${o.deletedAt} is null`))
    .where(and(eq(s.visits.promoterId, scope.userId), eq(s.visits.clientId, scope.clientId), gte(s.visits.visitDate, since)))
    .groupBy(s.visits.id, s.stores.id)
    .orderBy(desc(s.visits.startedAt));
  return rows.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  }));
}
