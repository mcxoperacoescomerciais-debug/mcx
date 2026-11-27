/**
 * Dados de DEMONSTRAÇÃO do modo ações (agência de degustação e ativação no Triângulo
 * Mineiro): 3 marcas fictícias (café, laticínio e bebida), 18 PDVs em Uberlândia, Uberaba
 * e Araguari, 9 promotoras e cerca de 75 dias de ações — com resultado, fotos ilustrativas,
 * ocorrências, cancelamentos, ações não realizadas e o financeiro de cada uma.
 *
 * Só a equipe MCX gera (Equipe MCX › Agências › a agência), digitando o nome da agência:
 * apaga os dados da agência (mantém os administradores, o nome, a logo e as configurações),
 * carrega a demonstração e liga o modo ações. As promotoras não têm senha conhecida: para
 * entrar no app com uma delas, o administrador define a senha em Usuários.
 */
import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import { hashPassword, type SessionUser } from "./auth";
import { audit } from "./audit";
import { storage } from "./storage";
import { removeStoredFiles, wipeKeepingAdmins } from "./agency-delete";
import { demoShot, type DemoShotKind } from "./demo-action-images";
import { mergeSettings } from "@/lib/settings";
import { productNameKey } from "@/lib/rules";
import { materialsFor } from "@/lib/tasting";
import { addDays, todayIso, weekdayOf } from "@/lib/dates";
import type { ActionOutcome } from "@/lib/actions";

type Result = { ok: true; message: string } | { ok: false; error: string };

const BRANDS = [
  {
    key: "cafe",
    name: "Café Serra Aurora",
    code: "CAFE",
    color: "#6B3E26",
    revenue: 380,
    materials: 48,
    conv: 0.15,
    acc: 4.4,
    products: ["Café Torrado e Moído Serra Aurora 500g", "Café Extraforte Serra Aurora 250g", "Cappuccino Serra Aurora 200g"],
    campaigns: { "10": ["AURORA-OUT26", "Degustação de café coado na hora"], "11": ["AURORA-NOV26", "Degustação de café coado na hora"], "12": ["AURORA-DEZ26", "Café da manhã de fim de ano"] },
  },
  {
    key: "lat",
    name: "Laticínios Vale Bonito",
    code: "VALEBONITO",
    color: "#1F6FB2",
    revenue: 420,
    materials: 72,
    conv: 0.11,
    acc: 4.1,
    products: ["Requeijão Cremoso Vale Bonito 200g", "Iogurte Grego Vale Bonito 100g", "Queijo Minas Frescal Vale Bonito 500g"],
    campaigns: { "10": ["VALE-OUT26", "Degustação de queijos e requeijão"], "11": ["VALE-NOV26", "Lançamento do iogurte grego"], "12": ["VALE-DEZ26", "Lançamento do iogurte grego"] },
  },
  {
    key: "beb",
    name: "Tropi Sabor Bebidas",
    code: "TROPISABOR",
    color: "#E07A1F",
    revenue: 360,
    materials: 55,
    conv: 0.18,
    acc: 4.0,
    products: ["Suco de Caju Tropi Sabor 1L", "Néctar de Manga Tropi Sabor 1L", "Bebida Isotônica Tropi Sabor 500ml"],
    campaigns: { "10": ["TROPI-OUT26", "Ativação de verão"], "11": ["TROPI-NOV26", "Ativação de verão"], "12": ["TROPI-DEZ26", "Ativação de fim de ano"] },
  },
] as const;

const CITIES = [
  { city: "Uberlândia", lat: -18.9186, lng: -48.2772, districts: ["Centro", "Santa Mônica", "Tibery", "Umuarama", "Martins", "Granada", "Luizote de Freitas", "Jardim Karaíba"] },
  { city: "Uberaba", lat: -19.7472, lng: -47.9381, districts: ["Centro", "Mercês", "Fabrício", "Abadia", "Boa Vista", "Estados Unidos"] },
  { city: "Araguari", lat: -18.6456, lng: -48.1934, districts: ["Centro", "Goiás", "Brasília", "Amorim"] },
] as const;
const CHAINS = ["Vereda Supermercados", "Ipê Amarelo Supermercados", "Super Mirante", "Paranaíba Max Atacarejo"];
const STREETS = ["Rua das Acácias", "Avenida dos Ipês", "Rua Monte Verde", "Avenida Cerrado", "Rua das Palmeiras", "Avenida Bela Vista", "Rua do Comércio", "Avenida Brasil Central"];

const PROMOTERS = [
  { name: "Ana Clara Mendes", city: "Uberlândia", conv: 1.25, punct: 0.97, photos: 1 },
  { name: "Beatriz Lopes", city: "Uberlândia", conv: 1.05, punct: 0.93, photos: 0.97 },
  { name: "Camila Ferraz", city: "Uberlândia", conv: 0.95, punct: 0.86, photos: 0.94 },
  { name: "Daniela Rocha", city: "Uberlândia", conv: 0.85, punct: 0.78, photos: 0.88 },
  { name: "Eduarda Silveira", city: "Uberaba", conv: 1.15, punct: 0.95, photos: 0.98 },
  { name: "Fernanda Queiroz", city: "Uberaba", conv: 0.95, punct: 0.9, photos: 0.95 },
  { name: "Gabriela Antunes", city: "Uberaba", conv: 0.9, punct: 0.82, photos: 0.9 },
  { name: "Helena Duarte", city: "Araguari", conv: 1.1, punct: 0.92, photos: 0.96 },
  { name: "Isabela Prado", city: "Araguari", conv: 0.9, punct: 0.88, photos: 0.92 },
] as const;

const SLOTS = [
  ["09:00", "15:00"],
  ["10:00", "16:00"],
  ["14:00", "20:00"],
] as const;
const CANCEL_REASONS = ["Marca remanejou a verba da semana", "Loja em inventário no dia", "Promotora sem substituta (atestado médico)", "Reforma no setor da loja", "Loja pediu para remarcar (movimento de feriado)"];
const NOT_DONE = [
  { reason: "Gerente da loja não autorizou a montagem do ponto", category: "manager_denied" },
  { reason: "Sem ponto de energia para o equipamento da degustação", category: "no_power_space" },
  { reason: "Produto da campanha em falta na loja no dia", category: "product_missing" },
] as const;
const NOTES = [
  "Clientes pediram o produto em embalagem maior.",
  "Muitos clientes já conheciam a marca e elogiaram o sabor.",
  "Movimento forte depois das 17h; vale reforçar esse horário.",
  "Gerente pediu para repetir a ação no próximo fim de semana.",
  "Público mais velho preferiu a versão tradicional.",
  "Crianças gostaram bastante; os pais levaram para casa.",
  "Gôndola estava com pouco estoque; repus durante a ação com o repositor.",
  "Preço promocional ajudou na conversão.",
  "Concorrente fazendo ação no mesmo corredor à tarde.",
  "Ponto ficou bem localizado, na entrada da loja.",
];
const OCC = [
  { category: "product_missing", note: "Faltou o produto na gôndola por cerca de 1 hora; o repositor trouxe do estoque." },
  { category: "late", note: "Cheguei 25 minutos depois por causa do ônibus." },
  { category: "no_power_space", note: "Tomada distante; usei extensão emprestada pela loja." },
  { category: "manager_denied", note: "Gerente pediu para mudar o ponto de lugar no meio da ação." },
  { category: "other", note: "Cliente passou mal com o calor do corredor; chamei o fiscal da loja." },
] as const;

function rng(seed: number) {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100_000) / 100_000;
  };
}

const at = (date: string, hhmm: string, plusMin = 0) => new Date(new Date(`${date}T${hhmm}:00-03:00`).getTime() + plusMin * 60_000);
const r2 = (v: number) => Math.round(v * 100) / 100;
const slugify = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/** Carrega a demonstração na agência (apaga os dados atuais, mantém os administradores). */
export async function seedActionsDemo(user: SessionUser, agencyId: string, confirmName: string): Promise<Result> {
  if (!user.platform) return { ok: false, error: "Somente a equipe MCX." };
  const db = await getDb();
  const [agency] = await db.select({ id: s.agencies.id, name: s.agencies.name, slug: s.agencies.slug, kind: s.agencies.kind, settings: s.agencies.settings }).from(s.agencies).where(eq(s.agencies.id, agencyId));
  if (!agency || agency.kind !== "client") return { ok: false, error: "Agência não encontrada." };
  if (confirmName.trim().toLowerCase() !== agency.name.trim().toLowerCase()) return { ok: false, error: `Para confirmar, digite exatamente o nome da agência: ${agency.name}` };

  const today = todayIso();
  const from = addDays(today, -60);
  const to = addDays(today, 14);
  const rand = rng(20261126);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const prefix = slugify(agency.slug).slice(0, 10) || "acoes";

  // Fotos ilustrativas: 3 variações por marca e tipo, gravadas uma vez e usadas por várias ações.
  const shots = new Map<string, { full: string; thumb: string; bytes: number; width: number; height: number }>();
  for (const b of BRANDS)
    for (const kind of ["before", "after", "closing"] as DemoShotKind[])
      for (let v = 1; v <= 3; v++) {
        const img = await demoShot(b.color, kind, v + BRANDS.indexOf(b) * 10);
        const base = `${agencyId}/demo-acoes/${b.key}-${kind}-${v}`;
        await storage().put(`${base}.jpg`, img.full, "image/jpeg");
        await storage().put(`${base}_thumb.jpg`, img.thumb, "image/jpeg");
        shots.set(`${b.key}|${kind}|${v}`, { full: `${base}.jpg`, thumb: `${base}_thumb.jpg`, bytes: img.full.length, width: img.width, height: img.height });
      }
  const passwordHash = await hashPassword(randomBytes(24).toString("base64url"));

  let files: string[] = [];
  const counts = await db.transaction(async (tx) => {
    files = (await wipeKeepingAdmins(tx, agencyId)).files;

    // Marcas e produtos.
    const brandRows = await tx
      .insert(s.brands)
      .values(BRANDS.map((b) => ({ agencyId, name: b.name, code: b.code, minBeforePhotos: 1, minAfterPhotos: 1, allowGallery: false, activities: ["Montar o ponto conforme o padrão da marca", "Abordar os clientes e oferecer a degustação", "Organizar o produto na gôndola ao lado do ponto", "Desmontar o ponto e deixar o espaço limpo"], notes: "Marca fictícia (exemplo de demonstração)", createdBy: user.id })))
      .returning({ id: s.brands.id, code: s.brands.code });
    const brandId = new Map(BRANDS.map((b) => [b.key, brandRows.find((r) => r.code === b.code)!.id]));
    await tx.insert(s.products).values(
      BRANDS.flatMap((b) => b.products.map((p, i) => ({ agencyId, brandId: brandId.get(b.key)!, name: p, nameKey: productNameKey(p), sku: `${b.code}-${String(i + 1).padStart(3, "0")}`, unit: "un" as const, createdBy: user.id }))),
    );

    // Redes e PDVs.
    const chainRows = await tx.insert(s.chains).values(CHAINS.map((name) => ({ agencyId, name }))).returning({ id: s.chains.id, name: s.chains.name });
    const storeDefs = CITIES.flatMap((c, ci) =>
      c.districts.map((d, di) => {
        const chain = CHAINS[(ci + di) % CHAINS.length];
        return {
          agencyId,
          chainId: chainRows.find((x) => x.name === chain)!.id,
          name: `${chain} ${d}`,
          code: `${c.city.slice(0, 3).toUpperCase()}-${String(di + 1).padStart(2, "0")}`,
          city: c.city,
          state: "MG",
          district: d,
          address: `${STREETS[(ci * 3 + di) % STREETS.length]}, ${200 + di * 137}`,
          lat: c.lat + (rand() - 0.5) * 0.05,
          lng: c.lng + (rand() - 0.5) * 0.05,
          createdBy: user.id,
        };
      }),
    );
    const stores = await tx.insert(s.stores).values(storeDefs).returning({ id: s.stores.id, name: s.stores.name, city: s.stores.city, lat: s.stores.lat, lng: s.stores.lng, chainId: s.stores.chainId });
    await tx.insert(s.storeBrands).values(stores.flatMap((st) => [...brandId.values()].map((b) => ({ storeId: st.id, brandId: b }))));
    const chainName = new Map(chainRows.map((c) => [c.id, c.name]));

    // Promotoras (usuárias do app) e o mesmo nome como degustadora/promotora da agenda.
    const users = [];
    for (const p of PROMOTERS) {
      let username = `${prefix}.${slugify(p.name.split(" ")[0])}${slugify(p.name.split(" ")[1] ?? "").slice(0, 3)}`;
      const [taken] = await tx.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.username}) = ${username}`);
      if (taken) username = `${username}${Math.floor(rand() * 90 + 10)}`;
      const [u] = await tx
        .insert(s.users)
        .values({ agencyId, role: "promoter", name: p.name, username, region: p.city, employment: "freelancer", passwordHash, mustChangePassword: false, geoPermission: "granted", geoCheckedAt: new Date(), createdBy: user.id })
        .returning({ id: s.users.id });
      users.push({ ...p, id: u.id });
    }
    await tx.insert(s.userStores).values(users.flatMap((u) => stores.filter((st) => st.city === u.city).map((st) => ({ userId: u.id, storeId: st.id }))));
    await tx.insert(s.userBrands).values(users.flatMap((u) => [...brandId.values()].map((b) => ({ userId: u.id, brandId: b }))));
    const tasters = await tx
      .insert(s.tasters)
      .values(PROMOTERS.map((p) => ({ agencyId, name: p.name, city: p.city, state: "MG", region: "Triângulo Mineiro", area: "Degustação e ativação", availability: "Quinta a domingo", experience: "Promotora de degustação (exemplo)", usualFee: 150, sample: true, createdBy: user.id })))
      .returning({ id: s.tasters.id, name: s.tasters.name });
    const tasterId = new Map(tasters.map((t) => [t.name, t.id]));

    // Ações dia a dia.
    const tastings: (typeof s.tastings.$inferInsert)[] = [];
    const schedules: (typeof s.schedules.$inferInsert)[] = [];
    const scheduleBrands: (typeof s.scheduleBrands.$inferInsert)[] = [];
    const visits: (typeof s.visits.$inferInsert)[] = [];
    const attendances: (typeof s.attendances.$inferInsert)[] = [];
    const photos: (typeof s.photos.$inferInsert)[] = [];
    const occurrences: (typeof s.occurrences.$inferInsert)[] = [];
    const materials: (typeof s.tastingMaterials.$inferInsert)[] = [];
    let realized = 0;
    let lost = 0;

    for (let date = from; date <= to; date = addDays(date, 1)) {
      const wd = weekdayOf(date); // 0 = domingo
      const intensity = wd === 6 ? 1 : wd === 5 ? 0.85 : wd === 4 ? 0.6 : wd === 0 ? 0.45 : 0.15;
      for (const c of CITIES) {
        const team = users.filter((u) => u.city === c.city);
        const cityStores = stores.filter((st) => st.city === c.city);
        const usedStores = new Set<string>();
        for (const u of team) {
          if (rand() > intensity) continue;
          const st = cityStores.filter((x) => !usedStores.has(x.id))[Math.floor(rand() * (cityStores.length - usedStores.size))];
          if (!st) continue;
          usedStores.add(st.id);
          const b = pick(BRANDS);
          const bId = brandId.get(b.key)!;
          const [start, end] = pick(SLOTS);
          const weekend = wd === 6 || wd === 0;
          const camp = b.campaigns[date.slice(5, 7) as "10" | "11" | "12"] ?? b.campaigns["11"];
          const revenue = b.revenue + (weekend ? 40 : 0);
          const fee = weekend ? 160 : 140;
          const transport = 18 + Math.floor(rand() * 20);
          const past = date < today;
          const isToday = date === today;
          // Situação: passado = realizada / cancelada / não realizada; hoje e futuro = agendada.
          const roll = rand();
          const status: "completed" | "cancelled" | "not_done" | "confirmed" | "awaiting_confirmation" | "awaiting_taster" = past
            ? roll < 0.06
              ? "cancelled"
              : roll < 0.1
                ? "not_done"
                : "completed"
            : isToday
              ? "confirmed"
              : roll < 0.7
                ? "confirmed"
                : roll < 0.9
                  ? "awaiting_confirmation"
                  : "awaiting_taster";
          const notDone = status === "not_done" ? pick(NOT_DONE) : null;
          const tId = randomUUID();
          const ageDays = Math.round((new Date(today).getTime() - new Date(date).getTime()) / 864e5);
          tastings.push({
            id: tId,
            agencyId,
            brandId: bId,
            storeId: st.id,
            chainName: chainName.get(st.chainId ?? "") ?? null,
            storeName: st.name,
            city: st.city,
            state: "MG",
            date,
            startTime: start,
            endTime: end,
            product: pick(b.products),
            description: camp[1],
            orderRef: camp[0],
            materialsNote: "Kit da marca, copinhos, guardanapos e extensão elétrica",
            status,
            tasterId: status === "awaiting_taster" ? null : tasterId.get(u.name)!,
            contactStatus: status === "awaiting_taster" ? "not_contacted" : status === "awaiting_confirmation" ? "waiting" : "confirmed",
            revenue,
            taxes: r2(revenue * 0.0565),
            tasterFee: fee,
            transport,
            food: 25,
            materialsCost: b.materials,
            otherCost: 0,
            ...(status === "completed"
              ? { transportActual: transport + Math.floor(rand() * 9) - 4, materialsCostActual: b.materials + Math.floor(rand() * 15) - 5, otherCostActual: rand() < 0.15 ? 12 : 0, completedAt: at(date, end, 10) }
              : {}),
            cancelReason: status === "cancelled" ? pick(CANCEL_REASONS) : notDone?.reason ?? null,
            cancellationFee: status === "cancelled" && rand() < 0.3 ? r2(revenue * 0.5) : null,
            billingStatus: status === "completed" && ageDays > 15 ? "billed" : "not_billed",
            billedAmount: status === "completed" && ageDays > 15 ? revenue : null,
            receiptStatus: status === "completed" && ageDays > 35 ? "received" : "pending",
            receivedAmount: status === "completed" && ageDays > 35 ? revenue : null,
            tasterPaymentStatus: status === "completed" && ageDays > 7 ? "paid" : "pending",
            paidAmount: status === "completed" && ageDays > 7 ? fee : null,
            sample: true,
            createdBy: user.id,
          });
          for (const item of materialsFor({ code: b.code, name: b.name })) materials.push({ tastingId: tId, item, checked: past || status === "confirmed" });

          if (status === "cancelled" || status === "awaiting_taster") {
            if (status === "cancelled") lost++;
            continue;
          }
          // Agenda da promotora no app (programação).
          const schId = randomUUID();
          schedules.push({ id: schId, agencyId, promoterId: u.id, storeId: st.id, date, seq: 1, plannedStart: start, plannedEnd: end, origin: "manual", createdBy: user.id });
          scheduleBrands.push({ scheduleId: schId, brandId: bId });
          if (!past) continue;

          // Execução no app: check-in, fotos, resultado, ocorrências, check-out.
          const late = rand() > u.punct;
          const checkIn = at(date, start, late ? 15 + Math.floor(rand() * 30) : -12 + Math.floor(rand() * 18));
          const checkOut = at(date, end, notDone ? -(300 - Math.floor(rand() * 30)) : -8 + Math.floor(rand() * 20));
          const visitId = randomUUID();
          const attId = randomUUID();
          visits.push({
            id: visitId,
            agencyId,
            promoterId: u.id,
            storeId: st.id,
            scheduleId: schId,
            visitDate: date,
            status: "completed",
            origin: "scheduled",
            startedAt: checkIn,
            finishedAt: checkOut,
            lat: (st.lat ?? c.lat) + (rand() - 0.5) * 0.0006,
            lng: (st.lng ?? c.lng) + (rand() - 0.5) * 0.0006,
            accuracyM: 6 + Math.floor(rand() * 18),
            geoStatus: "captured",
            createdBy: u.id,
            updatedBy: u.id,
          });
          const v = 1 + Math.floor(rand() * 3);
          const shot = (kind: DemoShotKind, when: Date) => {
            const sh = shots.get(`${b.key}|${kind}|${v}`)!;
            photos.push({ id: randomUUID(), agencyId, attendanceId: attId, kind, source: "camera", takenAt: when, uploadedAt: new Date(when.getTime() + 90_000), storageKey: sh.full, thumbKey: sh.thumb, contentType: "image/jpeg", bytes: sh.bytes, width: sh.width, height: sh.height, createdBy: u.id });
          };
          if (notDone) {
            lost++;
            shot("before", new Date(checkIn.getTime() + 8 * 60_000));
            attendances.push({ id: attId, agencyId, visitId, brandId: bId, status: "cancelled", startedAt: new Date(checkIn.getTime() + 2 * 60_000), finishedAt: new Date(checkOut.getTime() - 60_000), cancelReason: notDone.reason, createdBy: u.id, updatedBy: u.id });
            occurrences.push({ id: randomUUID(), agencyId, attendanceId: attId, category: notDone.category, note: notDone.reason, recordedAt: new Date(checkIn.getTime() + 20 * 60_000), createdBy: u.id });
            continue;
          }
          realized++;
          const busy = (weekend ? 1.35 : 1) * (start === "14:00" ? 1.15 : 1) * (0.8 + rand() * 0.45);
          const approached = Math.round(95 * busy);
          const samples = Math.round(approached * (0.75 + rand() * 0.3));
          const conv = b.conv * u.conv * (0.75 + rand() * 0.5);
          const outcome: ActionOutcome = {
            approached,
            samples,
            unitsSold: Math.max(1, Math.round(approached * conv)),
            acceptance: Math.max(2, Math.min(5, Math.round(b.acc + (u.conv - 1) * 2 + (rand() - 0.5) * 1.6))),
          };
          attendances.push({
            id: attId,
            agencyId,
            visitId,
            brandId: bId,
            status: "completed",
            startedAt: new Date(checkIn.getTime() + 3 * 60_000),
            finishedAt: new Date(checkOut.getTime() - 4 * 60_000),
            activitiesDone: ["Montar o ponto conforme o padrão da marca", "Abordar os clientes e oferecer a degustação", "Organizar o produto na gôndola ao lado do ponto", "Desmontar o ponto e deixar o espaço limpo"],
            notes: rand() < 0.4 ? pick(NOTES) : null,
            actionResult: outcome,
            reportLinkId: randomUUID(),
            createdBy: u.id,
            updatedBy: u.id,
          });
          shot("before", new Date(checkIn.getTime() + (10 + Math.floor(rand() * 15)) * 60_000));
          shot("after", new Date((checkIn.getTime() + checkOut.getTime()) / 2));
          if (rand() < u.photos) shot("closing", new Date(checkOut.getTime() - 12 * 60_000));
          if (late && rand() < 0.6) occurrences.push({ id: randomUUID(), agencyId, attendanceId: attId, category: "late", note: OCC[1].note, recordedAt: new Date(checkIn.getTime() + 5 * 60_000), createdBy: u.id });
          else if (rand() < 0.14) {
            const o = pick(OCC.filter((x) => x.category !== "late"));
            occurrences.push({ id: randomUUID(), agencyId, attendanceId: attId, category: o.category, note: o.note, recordedAt: new Date(checkIn.getTime() + 120 * 60_000), createdBy: u.id });
          }
        }
      }
    }

    const chunk = async <T,>(rows: T[], size: number, fn: (part: T[]) => Promise<unknown>) => {
      for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
    };
    await chunk(tastings, 200, (p) => tx.insert(s.tastings).values(p));
    await chunk(materials, 800, (p) => tx.insert(s.tastingMaterials).values(p));
    await chunk(schedules, 400, (p) => tx.insert(s.schedules).values(p));
    await chunk(scheduleBrands, 1000, (p) => tx.insert(s.scheduleBrands).values(p));
    await chunk(visits, 300, (p) => tx.insert(s.visits).values(p));
    await chunk(attendances, 300, (p) => tx.insert(s.attendances).values(p));
    await chunk(photos, 400, (p) => tx.insert(s.photos).values(p));
    await chunk(occurrences, 400, (p) => tx.insert(s.occurrences).values(p));

    // Despesas fixas de exemplo (DRE geral), só se a agência ainda não tem nenhuma.
    const [hasExpense] = await tx.select({ id: s.fixedExpenses.id }).from(s.fixedExpenses).where(eq(s.fixedExpenses.agencyId, agencyId)).limit(1);
    if (!hasExpense) {
      const start = from.slice(0, 7);
      await tx.insert(s.fixedExpenses).values([
        { agencyId, name: "Aluguel do escritório (exemplo)", category: "occupancy", amount: 2200, startMonth: start, createdBy: user.id },
        { agencyId, name: "Coordenadora de equipe (exemplo)", category: "staff", amount: 3800, startMonth: start, createdBy: user.id },
        { agencyId, name: "Contabilidade (exemplo)", category: "services", amount: 650, startMonth: start, createdBy: user.id },
        { agencyId, name: "Sistema, internet e telefone (exemplo)", category: "systems", amount: 420, startMonth: start, createdBy: user.id },
      ]);
    }

    // Liga o modo ações e marca a agência como demonstração.
    const prev = mergeSettings(agency.settings);
    const next = mergeSettings({ ...prev, demo: true, overviewStyle: "standard", modules: { ...prev.modules, actions: true, stock: false, damage: false, tastings: true, finance: true, sistematica: false } });
    await tx.update(s.agencies).set({ settings: next, updatedAt: new Date() }).where(eq(s.agencies.id, agencyId));
    await audit({ agencyId, userId: user.id }, "demo", agencyId, "actions_demo_created", { after: { tastings: tastings.length, realized, lost, photos: photos.length } }, tx);
    return { tastings: tastings.length, realized, lost, stores: stores.length, promoters: users.length };
  });
  // Arquivos das fotos antigas (depois do commit); as ilustrativas novas ficam.
  const keep = new Set([...shots.values()].flatMap((x) => [x.full, x.thumb]));
  await removeStoredFiles(files.filter((f) => !keep.has(f)));
  return {
    ok: true,
    message: `Demonstração carregada: ${counts.stores} PDVs em 3 cidades, ${counts.promoters} promotoras, ${counts.tastings} ações na agenda (${counts.realized} realizadas, ${counts.lost} canceladas ou não realizadas). Modo ações ligado.`,
  };
}
