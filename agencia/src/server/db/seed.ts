/**
 * Dados de DEMONSTRAÇÃO — só para o banco embutido de desenvolvimento.
 *
 * Lojas: nomes e cidades reais da rota SUINCO (Super ABC / Super BH) + lojas
 * de BH. Produtos SUINCO: códigos e descrições reais do mix. Bravo Café,
 * Fofinho e Dona Clara têm catálogo ILUSTRATIVO (substitua importando a
 * planilha real em Cadastros › Importar). Em produção nada disto roda: o
 * bootstrap cria só a agência e o primeiro administrador.
 */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { DB } from "./index";
import * as s from "./schema";
import { addDays, todayIso, weekdayOf } from "../../lib/dates";
import { productNameKey } from "../../lib/rules";
import type { RuptureSituation, StockState, Unit } from "../../lib/domain";
import { demoShelfPng } from "./demo-image";
import { photoKeys, storage } from "../storage";

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "demo1234";

const BRANDS = [
  {
    code: "BRAVO",
    name: "Bravo Café",
    activities: ["Abastecer a gôndola", "Organizar frentes (facing)", "Conferir etiquetas de preço", "Retirar avariados"],
    products: [
      ["BRV-001", "Café Bravo Tradicional 500 g", "Café torrado e moído", "Tradicional", "500 g", "pct"],
      ["BRV-002", "Café Bravo Tradicional 250 g", "Café torrado e moído", "Tradicional", "250 g", "pct"],
      ["BRV-003", "Café Bravo Extraforte 500 g", "Café torrado e moído", "Extraforte", "500 g", "pct"],
      ["BRV-004", "Café Bravo Gourmet 250 g", "Café especial", "Gourmet", "250 g", "pct"],
      ["BRV-005", "Café Bravo Vácuo 500 g", "Café torrado e moído", "Tradicional", "500 g vácuo", "pct"],
      ["BRV-006", "Café Bravo Cápsula 10 un", "Cápsulas", "Intenso", "10 cápsulas", "cx"],
    ],
  },
  {
    code: "FOFINHO",
    name: "Fofinho",
    activities: ["Abastecer a gôndola", "Organizar frentes (facing)", "Verificar validade na área de venda"],
    products: [
      ["FOF-010", "Pão de Forma Fofinho Tradicional 500 g", "Panificados", "Tradicional", "500 g", "pct"],
      ["FOF-011", "Pão de Forma Fofinho Integral 450 g", "Panificados", "Integral", "450 g", "pct"],
      ["FOF-012", "Bisnaguinha Fofinho 300 g", "Panificados", "Tradicional", "300 g", "pct"],
      ["FOF-013", "Bolo Fofinho Chocolate 250 g", "Bolos", "Chocolate", "250 g", "un"],
      ["FOF-014", "Bolo Fofinho Laranja 250 g", "Bolos", "Laranja", "250 g", "un"],
    ],
  },
  {
    code: "SUINCO",
    name: "Suinco",
    activities: ["Abastecer balcão refrigerado", "Organizar frentes (facing)", "Retirar itens vencidos", "Conferir temperatura do balcão"],
    products: [
      ["30034", "BACON EM PEDACOS COZINHA PREMIADA", "Defumados", null, null, "kg"],
      ["10710", "PICANHA SUINA TEMPERADA RESF", "Temperados", null, null, "un"],
      ["10740", "ALCATRA SUINA TEMPERADA RESF", "Temperados", null, null, "un"],
      ["40000", "PRESUNTO RESF. COZINHA PREMIADA", "Frios", null, null, "kg"],
      ["50000", "APRESUNTADO RESF. COZINHA PREMIADA", "Frios", null, null, "kg"],
      ["30103", "LINGUICA TIPO CALABRESA 2,5 kg", "Embutidos", null, "2,5 kg", "un"],
      ["30056", "BACON DE PALETA EM CUBOS 250g", "Defumados", null, "250 g", "un"],
      ["30051", "BACON FATIADO 1 KG", "Defumados", null, "1 kg", "un"],
      ["70041", "TORRESMO POTE 90 G", "Petiscos", null, "90 g", "un"],
      ["20053", "LINGUIÇA COM QUEIJO 600 G", "Embutidos", null, "600 g", "un"],
    ],
  },
  {
    code: "DONACLARA",
    name: "Dona Clara",
    activities: ["Abastecer a gôndola", "Montar ponto extra quando autorizado"],
    products: [
      ["DCL-100", "Biscoito Dona Clara Maisena 400 g", "Biscoitos", "Maisena", "400 g", "pct"],
      ["DCL-101", "Biscoito Dona Clara Rosquinha Coco 350 g", "Biscoitos", "Coco", "350 g", "pct"],
      ["DCL-102", "Biscoito Dona Clara Cream Cracker 400 g", "Biscoitos", "Cream cracker", "400 g", "pct"],
    ],
  },
] as const;

const STORES = [
  { chain: "Super ABC", name: "Super ABC Formiga 63", code: "63", city: "Formiga", address: "Av. Antônio Olímpio de Morais, 1200", brands: ["BRAVO", "FOFINHO", "SUINCO"], lat: -20.4628, lng: -45.4291 },
  { chain: "Super ABC", name: "Super ABC Formiga 08", code: "08", city: "Formiga", address: "Rua Silviano Brandão, 455", brands: ["BRAVO", "SUINCO"], lat: -20.4661, lng: -45.4254 },
  { chain: "Super BH", name: "Super BH Formiga", code: null, city: "Formiga", address: "Av. Brasil, 2300", brands: ["BRAVO", "FOFINHO", "SUINCO", "DONACLARA"], lat: -20.4597, lng: -45.4222 },
  { chain: "Super ABC", name: "Hiper ABC Arcos 30", code: "30", city: "Arcos", address: "Av. Magalhães Pinto, 980", brands: ["BRAVO", "FOFINHO", "SUINCO"], lat: -20.2836, lng: -45.5402 },
  { chain: "Super BH", name: "Super BH Arcos", code: null, city: "Arcos", address: "Rua Getúlio Vargas, 150", brands: ["FOFINHO", "SUINCO"], lat: -20.2811, lng: -45.5361 },
  { chain: "Super ABC", name: "Super ABC Lagoa da Prata 20", code: "20", city: "Lagoa da Prata", address: "Av. Brasil, 1501", brands: ["BRAVO", "FOFINHO", "SUINCO"], lat: -20.0219, lng: -45.5447 },
  { chain: "Super BH", name: "Super BH Lagoa da Prata 113", code: "113", city: "Lagoa da Prata", address: "Rua Pará, 300", brands: ["BRAVO", "SUINCO", "DONACLARA"], lat: -20.0247, lng: -45.5408 },
  { chain: "Super BH", name: "Super BH Pio XII", code: "616", city: "Itaúna", address: "Av. Pio XII, 2001", brands: ["BRAVO", "FOFINHO", "SUINCO"], lat: -20.0789, lng: -44.5803 },
  { chain: "Super ABC", name: "Super ABC Praça", code: null, city: "Itaúna", address: "Praça Dr. Augusto Gonçalves, 55", brands: ["BRAVO", "FOFINHO", "SUINCO", "DONACLARA"], lat: -20.0742, lng: -44.5751 },
  { chain: "Epa", name: "Epa Plus Prado", code: "214", city: "Belo Horizonte", address: "Rua Platina, 1460 — Prado", brands: ["BRAVO", "FOFINHO", "DONACLARA"], lat: -19.9283, lng: -43.9636 },
  { chain: "Verdemar", name: "Verdemar Sion", code: "05", city: "Belo Horizonte", address: "Av. Uruguai, 330 — Sion", brands: ["BRAVO", "FOFINHO"], lat: -19.953, lng: -43.93 },
  { chain: "Epa", name: "Epa Santa Efigênia", code: "118", city: "Belo Horizonte", address: "Av. Brasil, 1650 — Santa Efigênia", brands: ["BRAVO", "DONACLARA"] },
];

const PROMOTERS = [
  { username: "joao", name: "João Batista", employment: "fixed", region: "Centro-Oeste MG", stores: [0, 1, 2], start: ["08:00", "10:30", "14:00"] },
  { username: "patricia", name: "Patrícia Lima", employment: "fixed", region: "Centro-Oeste MG", stores: [3, 4, 5, 6], start: ["08:00", "10:00", "13:30", "15:30"] },
  { username: "lucas", name: "Lucas Andrade", employment: "fixed", region: "Itaúna", stores: [7, 8], start: ["08:30", "13:00"] },
  { username: "ana", name: "Ana Freitas", employment: "freelancer", region: "Belo Horizonte", stores: [9, 10, 11], start: [null, null, null] },
] as const;

export async function seedDemoIfEmpty(db: DB): Promise<void> {
  const [existing] = await db.select({ id: s.agencies.id }).from(s.agencies).limit(1);
  if (existing) return;
  console.log("[seed] Criando dados de demonstração…");

  let rnd = 42;
  const rand = () => {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
    return rnd / 0x7fffffff;
  };
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const [agency] = await db.insert(s.agencies).values({ name: "AF Merchandising", slug: "af" }).returning();
  const A = agency.id;

  const [admin] = await db.insert(s.users).values({ agencyId: A, role: "admin", name: "Administrador", username: "admin", passwordHash: hash }).returning();
  const [gestor] = await db
    .insert(s.users)
    .values({ agencyId: A, role: "manager", name: "Marina Couto", username: "gestor", email: "gestor@exemplo.com", passwordHash: hash })
    .returning();

  // Marcas e produtos.
  const brandId: Record<string, string> = {};
  const productsByBrand: Record<string, { id: string; unit: Unit }[]> = {};
  for (const b of BRANDS) {
    const [row] = await db
      .insert(s.brands)
      .values({
        agencyId: A,
        name: b.name,
        code: b.code,
        activities: [...b.activities],
        minBeforePhotos: 1,
        minAfterPhotos: 1,
        requireStock: true,
        rupturePhotoRequired: b.code === "SUINCO",
        createdBy: admin.id,
      })
      .returning();
    brandId[b.code] = row.id;
    productsByBrand[b.code] = [];
    let order = 0;
    for (const [sku, name, category, variant, pack, unit] of b.products) {
      const [p] = await db
        .insert(s.products)
        .values({ agencyId: A, brandId: row.id, sku, name, nameKey: productNameKey(name), category, variant, package: pack, unit: unit as Unit, sortOrder: order++ })
        .returning({ id: s.products.id, unit: s.products.unit });
      productsByBrand[b.code].push(p);
    }
  }

  const [gestoraBravo] = await db
    .insert(s.users)
    .values({ agencyId: A, role: "manager", name: "Renata (cliente Bravo Café)", username: "bravo", allBrands: false, passwordHash: hash })
    .returning();
  await db.insert(s.userBrands).values({ userId: gestoraBravo.id, brandId: brandId.BRAVO });

  // Redes e lojas.
  const chainId: Record<string, string> = {};
  for (const name of [...new Set(STORES.map((x) => x.chain))]) {
    const [c] = await db.insert(s.chains).values({ agencyId: A, name }).returning();
    chainId[name] = c.id;
  }
  const storeIds: string[] = [];
  for (const st of STORES) {
    const [row] = await db
      .insert(s.stores)
      .values({ agencyId: A, chainId: chainId[st.chain], name: st.name, code: st.code, city: st.city, state: "MG", address: st.address, lat: "lat" in st ? st.lat : null, lng: "lng" in st ? st.lng : null, createdBy: admin.id })
      .returning();
    storeIds.push(row.id);
    await db.insert(s.storeBrands).values(st.brands.map((b) => ({ storeId: row.id, brandId: brandId[b] })));
  }
  // Loja com lista própria de produtos acompanhados (exemplo da regra "produtos por loja").
  await db.insert(s.storeProducts).values(productsByBrand.BRAVO.slice(0, 4).map((p) => ({ storeId: storeIds[1], productId: p.id })));

  // Promotores, autorizações e roteiros.
  const today = todayIso();
  const promoters: { id: string; def: (typeof PROMOTERS)[number] }[] = [];
  for (const def of PROMOTERS) {
    const [u] = await db
      .insert(s.users)
      .values({
        agencyId: A,
        role: "promoter",
        name: def.name,
        username: def.username,
        employment: def.employment,
        region: def.region,
        managerId: gestor.id,
        internalCode: `P-${100 + promoters.length}`,
        passwordHash: hash,
      })
      .returning();
    promoters.push({ id: u.id, def });
    await db.insert(s.userStores).values(def.stores.map((i) => ({ userId: u.id, storeId: storeIds[i] })));
    const brandCodes = [...new Set(def.stores.flatMap((i) => STORES[i].brands))];
    await db.insert(s.userBrands).values(brandCodes.map((b) => ({ userId: u.id, brandId: brandId[b] })));
    if (def.employment === "fixed") {
      const [route] = await db
        .insert(s.routes)
        .values({ agencyId: A, name: `Roteiro ${def.region} — ${def.name.split(" ")[0]}`, region: def.region, promoterId: u.id, weekdays: [1, 2, 3, 4, 5, 6], createdBy: gestor.id })
        .returning();
      await db.insert(s.routeStops).values(
        def.stores.map((i, seq) => ({ routeId: route.id, storeId: storeIds[i], seq, plannedStart: def.start[seq], brandIds: STORES[i].brands.map((b) => brandId[b]) })),
      );
    }
  }

  // Programações: últimos 6 dias + hoje + amanhã (domingo sem programação).
  type Sched = { id: string; promoterId: string; storeIdx: number; date: string; plannedStart: string | null; brandCodes: string[] };
  const schedules: Sched[] = [];
  for (let d = -6; d <= 1; d++) {
    const date = addDays(today, d);
    if (weekdayOf(date) === 0) continue;
    for (const p of promoters) {
      // Freelancer: trabalho pontual (só alguns dias).
      if (p.def.employment === "freelancer" && ![-5, -2, 0, 1].includes(d)) continue;
      for (const [seq, idx] of p.def.stores.entries()) {
        const brandCodes = [...STORES[idx].brands];
        const [row] = await db
          .insert(s.schedules)
          .values({ agencyId: A, promoterId: p.id, storeId: storeIds[idx], date, seq, plannedStart: p.def.start[seq], createdBy: gestor.id })
          .returning({ id: s.schedules.id });
        await db.insert(s.scheduleBrands).values(brandCodes.map((b) => ({ scheduleId: row.id, brandId: brandId[b] })));
        schedules.push({ id: row.id, promoterId: p.id, storeIdx: idx, date, plannedStart: p.def.start[seq], brandCodes });
      }
    }
  }

  // Execução histórica (dias anteriores) e parte de hoje.
  const at = (date: string, hhmm: string, plusMin = 0) => {
    const [h, m] = hhmm.split(":").map(Number);
    return new Date(Date.parse(`${date}T00:00:00-03:00`) + (h * 60 + m + plusMin) * 60_000);
  };
  let photoSeed = 1;
  const savePhoto = async (attendanceId: string, visitId: string, date: string, kind: "before" | "after" | "rupture", takenAt: Date, uploadedBy: string, ruptureId: string | null = null) => {
    const id = randomUUID();
    const keys = photoKeys(A, date, visitId, attendanceId, id);
    const full = demoShelfPng(640, 480, kind, photoSeed++);
    const thumb = demoShelfPng(240, 180, kind, photoSeed - 1);
    await storage().put(keys.full, full, "image/png");
    await storage().put(keys.thumb, thumb, "image/png");
    await db.insert(s.photos).values({
      id,
      agencyId: A,
      attendanceId,
      kind,
      ruptureId,
      takenAt,
      uploadedAt: new Date(takenAt.getTime() + 60_000),
      storageKey: keys.full,
      thumbKey: keys.thumb,
      contentType: "image/png",
      bytes: full.byteLength,
      width: 640,
      height: 480,
      createdBy: uploadedBy,
    });
  };

  const RUPTURE_KINDS: RuptureSituation[] = ["shelf_empty", "missing_display", "registered_not_found", "unconfirmed", "backroom_empty"];
  let correctionDone = false;
  for (const sc of schedules) {
    const dayOffset = Math.round((Date.parse(sc.date) - Date.parse(today)) / 86_400_000);
    if (dayOffset > 0) continue;
    const promoter = promoters.find((p) => p.id === sc.promoterId)!;
    const isToday = dayOffset === 0;
    // Hoje: João está no meio da 2ª loja; Patrícia concluiu a 1ª; Lucas ainda não começou; Ana concluiu a 1ª.
    const seq = promoter.def.stores.indexOf(sc.storeIdx as never);
    if (isToday) {
      const doneToday = { joao: 2, patricia: 1, lucas: 0, ana: 1 }[promoter.def.username];
      if (seq >= doneToday) continue;
    } else if (rand() < 0.06) {
      continue; // Visita não realizada (aparece como "Não realizada" no histórico).
    }
    const start = sc.plannedStart ?? ["09:00", "11:00", "14:30"][seq] ?? "10:00";
    const visitId = randomUUID();
    const startedAt = at(sc.date, start, Math.floor(rand() * 25) - 5);
    const inProgress = isToday && promoter.def.username === "joao" && seq === 1;
    let cursor = startedAt.getTime() + 3 * 60_000;
    await db.insert(s.visits).values({
      id: visitId,
      agencyId: A,
      promoterId: sc.promoterId,
      storeId: storeIds[sc.storeIdx],
      scheduleId: sc.id,
      visitDate: sc.date,
      status: "in_progress",
      origin: "scheduled",
      startedAt,
      syncedAt: startedAt,
      geoStatus: "captured",
      // Localização registrada perto da loja (Santa Efigênia fica sem coordenadas de propósito).
      lat: ("lat" in STORES[sc.storeIdx] ? (STORES[sc.storeIdx] as { lat: number }).lat : -19.92) + (rand() - 0.5) * 0.002,
      lng: ("lng" in STORES[sc.storeIdx] ? (STORES[sc.storeIdx] as { lng: number }).lng : -43.93) + (rand() - 0.5) * 0.002,
      accuracyM: 12 + Math.round(rand() * 30),
      createdBy: sc.promoterId,
    });

    let skippedBrand: string | null = null;
    for (const [bi, code] of sc.brandCodes.entries()) {
      // Em ~5% das visitas uma marca fica sem atendimento (encerrada com justificativa).
      if (!isToday && bi === sc.brandCodes.length - 1 && sc.brandCodes.length > 2 && rand() < 0.05) {
        skippedBrand = code;
        continue;
      }
      if (inProgress && bi >= 2) break;
      const attId = randomUUID();
      const aStart = new Date(cursor);
      const duration = 18 + Math.floor(rand() * 22);
      cursor += duration * 60_000;
      const aEnd = new Date(cursor);
      cursor += 2 * 60_000;
      const attInProgress = inProgress && bi === 1;
      const exception = !attInProgress && rand() < 0.05;
      const brand = BRANDS.find((b) => b.code === code)!;
      await db.insert(s.attendances).values({
        id: attId,
        agencyId: A,
        visitId,
        brandId: brandId[code],
        status: attInProgress ? "in_progress" : "completed",
        startedAt: aStart,
        finishedAt: attInProgress ? null : aEnd,
        activitiesDone: attInProgress ? [brand.activities[0]] : [...brand.activities],
        exceptionItems: exception ? ["after_photo"] : [],
        exceptionReason: exception ? "camera_unavailable" : null,
        exceptionNote: exception ? "Celular descarregou antes da foto final." : null,
        createdBy: sc.promoterId,
      });
      await savePhoto(attId, visitId, sc.date, "before", new Date(aStart.getTime() + 60_000), sc.promoterId);
      if (!exception && !attInProgress) await savePhoto(attId, visitId, sc.date, "after", new Date(aEnd.getTime() - 60_000), sc.promoterId);

      const products = sc.storeIdx === 1 && code === "BRAVO" ? productsByBrand.BRAVO.slice(0, 4) : productsByBrand[code];
      for (const [pi, p] of products.entries()) {
        if (attInProgress && pi > 1) break;
        const r = rand();
        const state: StockState = r < 0.06 ? "zero" : r < 0.09 ? "not_found" : r < 0.11 ? "not_applicable" : "quantity";
        const quantity = state === "quantity" ? 2 + Math.floor(rand() * 40) : state === "zero" ? 0 : null;
        await db.insert(s.stockEntries).values({
          agencyId: A,
          attendanceId: attId,
          productId: p.id,
          state,
          quantity,
          unit: p.unit,
          recordedAt: new Date(aStart.getTime() + (5 + pi) * 60_000),
          createdBy: sc.promoterId,
        });
        if ((state === "zero" || state === "not_found") && rand() < 0.75) {
          const rid = randomUUID();
          const situation = state === "not_found" ? "registered_not_found" : RUPTURE_KINDS[Math.floor(rand() * RUPTURE_KINDS.length)];
          const age = -dayOffset;
          const status = age >= 4 ? (rand() < 0.6 ? "resolved" : "treatment") : age >= 2 ? (rand() < 0.5 ? "analysis" : "new") : "new";
          await db.insert(s.ruptures).values({
            id: rid,
            agencyId: A,
            attendanceId: attId,
            productId: p.id,
            situation,
            knownStock: state === "zero" ? 0 : null,
            fromStockSuggestion: true,
            status,
            resolutionAction: status === "resolved" ? "Pedido emergencial feito pelo comprador da loja; produto reposto." : null,
            resolvedAt: status === "resolved" ? new Date(aEnd.getTime() + 2 * 86_400_000) : null,
            recordedAt: new Date(aStart.getTime() + (6 + pi) * 60_000),
            createdBy: sc.promoterId,
          });
          await db.insert(s.ruptureEvents).values({ ruptureId: rid, toStatus: "new", action: "Registrada em campo", userId: sc.promoterId, createdAt: aStart });
          if (status !== "new") {
            await db.insert(s.ruptureEvents).values({
              ruptureId: rid,
              fromStatus: "new",
              toStatus: status === "resolved" ? "treatment" : status,
              action: "Comprador da loja acionado.",
              userId: gestor.id,
              createdAt: new Date(aEnd.getTime() + 86_400_000),
            });
            if (status === "resolved") {
              await db.insert(s.ruptureEvents).values({
                ruptureId: rid,
                fromStatus: "treatment",
                toStatus: "resolved",
                action: "Pedido emergencial feito pelo comprador da loja; produto reposto.",
                userId: gestor.id,
                createdAt: new Date(aEnd.getTime() + 2 * 86_400_000),
              });
            }
          }
          if (brand.code === "SUINCO") await savePhoto(attId, visitId, sc.date, "rupture", new Date(aStart.getTime() + 8 * 60_000), sc.promoterId, rid);
        }
      }
      if (rand() < 0.08) {
        await db.insert(s.occurrences).values({
          id: randomUUID(),
          agencyId: A,
          attendanceId: attId,
          category: rand() < 0.5 ? "no_space" : "missing_material",
          note: rand() < 0.5 ? "Gôndola dividida com concorrente; espaço reduzido pela metade." : "Faixa de gôndola da campanha não chegou à loja.",
          recordedAt: aEnd,
          createdBy: sc.promoterId,
        });
      }
      // Uma correção solicitada pelo gestor (aparece para o promotor e na Central de pendências).
      if (!correctionDone && !isToday && dayOffset === -1 && !exception) {
        correctionDone = true;
        await db.update(s.attendances).set({ status: "correction_requested" }).where(eq(s.attendances.id, attId));
        await db.insert(s.correctionRequests).values({
          agencyId: A,
          attendanceId: attId,
          reason: "A foto do depois não mostra a gôndola inteira. Refaça a foto mostrando as 4 prateleiras.",
          requestedBy: gestor.id,
        });
        await db.insert(s.auditLogs).values({ agencyId: A, userId: gestor.id, entity: "attendance", entityId: attId, action: "correction_requested", reason: "Foto do depois incompleta" });
      }
    }
    if (!inProgress) {
      await db
        .update(s.visits)
        .set({
          status: skippedBrand ? "closed_incomplete" : "completed",
          closeReason: skippedBrand ? "Gerente da loja pediu para atender a marca em outro dia (setor em reforma)." : null,
          finishedAt: new Date(cursor + 2 * 60_000),
          syncedAt: new Date(cursor + 3 * 60_000),
        })
        .where(eq(s.visits.id, visitId));
    }
  }
  await seedPlatformDemo(db, hash, A);
  console.log(`[seed] Pronto. Usuários: mcx (equipe MCX), admin, gestor, bravo, joao, patricia, lucas, ana (AF), etros, carla (ETROS) — senha: ${process.env.DEMO_PASSWORD ? "DEMO_PASSWORD" : DEMO_PASSWORD}.`);
}

/**
 * Camada MCX de demonstração: a plataforma (usuário "mcx") e uma segunda
 * agência (ETROS) pequena, com cadastros PRÓPRIOS — inclusive uma loja com o
 * mesmo nome de uma loja da AF, para mostrar que nada se mistura.
 */
async function seedPlatformDemo(db: DB, hash: string, afId: string): Promise<void> {
  const [platform] = await db.insert(s.agencies).values({ name: "MCX", slug: "mcx-plataforma", kind: "platform" }).returning();
  await db.insert(s.users).values({ agencyId: platform.id, role: "admin", platform: true, name: "Equipe MCX", username: "mcx", passwordHash: hash });
  try {
    const { readFileSync } = await import("node:fs");
    const png = readFileSync(`${process.cwd()}/public/af_logo.png`);
    await db.update(s.agencies).set({ logo: `data:image/png;base64,${png.toString("base64")}` }).where(eq(s.agencies.id, afId));
  } catch {
    // Logo é opcional na demonstração.
  }

  // A ETROS trabalha por carteira com meta semanal (sem dia certo).
  const [etros] = await db.insert(s.agencies).values({ name: "ETROS", slug: "etros", settings: { defaultWorkMode: "portfolio" } }).returning();
  const E = etros.id;
  const [admin] = await db.insert(s.users).values({ agencyId: E, role: "admin", name: "Administrador ETROS", username: "etros", passwordHash: hash }).returning();
  const [brand] = await db
    .insert(s.brands)
    .values({ agencyId: E, name: "Doce Sabor", code: "DOCE", activities: ["Abastecer gôndola", "Conferir validade"], minBeforePhotos: 1, minAfterPhotos: 1, requireStock: true, createdBy: admin.id })
    .returning();
  const products = [
    ["DS-01", "Doce de Leite Doce Sabor 400g", "Doces"],
    ["DS-02", "Goiabada Doce Sabor 300g", "Doces"],
    ["DS-03", "Paçoca Doce Sabor 20un", "Doces"],
  ];
  let order = 0;
  for (const [sku, name, category] of products) {
    await db.insert(s.products).values({ agencyId: E, brandId: brand.id, sku, name, nameKey: productNameKey(name), category, unit: "un", sortOrder: order++ });
  }
  const [chain] = await db.insert(s.chains).values({ agencyId: E, name: STORES[0].chain }).returning();
  const storeIds: string[] = [];
  for (const st of STORES.slice(0, 2)) {
    const [row] = await db.insert(s.stores).values({ agencyId: E, chainId: chain.id, name: st.name, code: `E-${st.code}`, city: st.city, state: "MG", address: st.address, createdBy: admin.id }).returning();
    storeIds.push(row.id);
    await db.insert(s.storeBrands).values({ storeId: row.id, brandId: brand.id });
  }
  const [carla] = await db
    .insert(s.users)
    .values({ agencyId: E, role: "promoter", name: "Carla Mendes", username: "carla", employment: "fixed", region: "BH", passwordHash: hash })
    .returning();
  await db.insert(s.userStores).values(storeIds.map((storeId) => ({ userId: carla.id, storeId })));
  await db.insert(s.userBrands).values({ userId: carla.id, brandId: brand.id });
  // Carteira da Carla: 2 visitas por semana na 1ª loja e 1 na 2ª.
  await db.insert(s.visitTargets).values(storeIds.map((storeId, i) => ({ agencyId: E, promoterId: carla.id, storeId, brandId: brand.id, perWeek: i === 0 ? 2 : 1, createdBy: admin.id })));
}
