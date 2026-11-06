/** Relatório da visita no WhatsApp (pergunta ao encerrar a visita, ligada na AF). */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { visitReportText, whatsappLink } from "../src/app/app/_lib/visit-report";
import type { LocalVisit } from "../src/app/app/_lib/local-store";
import type { BootstrapBrand, BootstrapProduct, BootstrapStore } from "../src/lib/sync-types";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";

const brand = { id: "b1", name: "Bravo Café" } as BootstrapBrand;
const products = new Map([
  ["p1", { id: "p1", name: "Café 500g" }],
  ["p2", { id: "p2", name: "Café 250g" }],
] as [string, BootstrapProduct][]);
const store = { id: "s1", name: "Super BH Pio XII", chainName: "Super BH", city: "Itaúna" } as BootstrapStore;

function visitWith(over: Record<string, unknown>): LocalVisit {
  return {
    id: "v1",
    storeId: "s1",
    visitDate: "2026-11-06",
    notes: "",
    attendances: {
      a1: {
        id: "a1",
        brandId: "b1",
        status: "completed",
        ruptures: {},
        validities: {},
        ...over,
      },
    },
  } as unknown as LocalVisit;
}

describe("relatório da visita no WhatsApp", () => {
  test("leva vencimentos (data, quantidade, valor) e rupturas de cada marca", () => {
    const text = visitReportText(
      visitWith({
        validities: { v1: { id: "v1", productId: "p1", expiryDate: "2026-11-10", quantity: 6, unit: "un", price: 12.9 } },
        ruptures: { r1: { id: "r1", productId: "p2", situation: "total" } },
      }),
      { agency: "AF Merchandising", promoter: "Lucas", store, brandById: new Map([["b1", brand]]), productById: products },
    );
    assert.match(text, /Relatório da visita – AF Merchandising/);
    assert.match(text, /Super BH Pio XII · Itaúna/);
    assert.match(text, /\*Bravo Café\*/);
    assert.match(text, /Café 500g – vence 10\/11 \(.+\) · 6 un · R\$\s?12,90/);
    assert.match(text, /Produtos em ruptura \(1\)/);
    assert.match(text, /Café 250g – Ruptura total/);
  });

  test("sem registros, avisa que não há vencimentos nem rupturas", () => {
    const text = visitReportText(visitWith({}), { agency: "AF", promoter: "Lucas", store, brandById: new Map([["b1", brand]]), productById: products });
    assert.match(text, /Nenhum produto próximo ao vencimento/);
    assert.match(text, /Nenhum produto em ruptura/);
  });

  test("com número abre a conversa; sem número o promotor escolhe o contato", () => {
    assert.ok(whatsappLink("oi", "(31) 99999-8888").startsWith("https://wa.me/31999998888?text="));
    assert.ok(whatsappLink("oi", "").startsWith("https://wa.me/?text="));
  });

  test("carga liga a pergunta só na AF e uma vez só", async () => {
    const db = await memDb();
    const { afVisitReport } = await import("../scripts/setup-data");
    const { mergeSettings } = await import("../src/lib/settings");
    await afVisitReport();
    const agencies = await db.select().from(s.agencies);
    const af = agencies.find((a) => a.name === "AF Merchandising")!;
    assert.equal(mergeSettings(af.settings).visitReport.enabled, true);
    for (const other of agencies.filter((a) => a.id !== af.id)) assert.equal(mergeSettings(other.settings).visitReport.enabled, false);
    // A AF desliga em Configurações: a carga não liga de novo.
    await db.update(s.agencies).set({ settings: { ...(af.settings as object), visitReport: { enabled: false, phone: "" } } as never }).where(eq(s.agencies.id, af.id));
    await afVisitReport();
    const [again] = await db.select().from(s.agencies).where(eq(s.agencies.id, af.id));
    assert.equal(mergeSettings(again.settings).visitReport.enabled, false);
  });
});
