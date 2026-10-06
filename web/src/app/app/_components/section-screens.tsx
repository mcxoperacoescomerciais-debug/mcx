"use client";

/**
 * Seções da visita com lista de produtos: Validade (área de vendas e
 * estoque), Ruptura e Avaria. Todas usam a mesma lista completa do mix da
 * loja com busca no topo (ProductList).
 */
import { useMemo, useState } from "react";
import { Camera, ChevronRight, ShieldAlert } from "lucide-react";
import { BottomBar, TopBar } from "./primitives";
import { ProductList, type ProductMark } from "./product-picker";
import { DamageSheet, ValiditySheet, type SheetTarget } from "./occurrence-sheets";
import { MissingVisit, sectionItems, storeTitle, useSeverityOf, type Section } from "./visit-common";
import { SeverityBadge } from "@/components/ui";
import { DAMAGE_KIND_LABEL, SEVERITY_COLOR, type Location } from "@/lib/domain";
import { describeDays, formatIsoBr } from "@/lib/validity";
import { deleteOccurrence, saveOccurrence } from "../_lib/local-store";
import { back, haptic, useCatalog, useVisit } from "../_lib/hooks";

const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

// ───────────────────────────── Validade / Estoque ─────────────────────────────

export function ValidityScreen({ visitId, location }: { visitId: string; location: Extract<Location, "sales_floor" | "stock"> }) {
  const visit = useVisit(visitId);
  const { storeById, productById } = useCatalog();
  const sev = useSeverityOf();
  const [target, setTarget] = useState<SheetTarget | null>(null);
  const section: Section = location === "stock" ? "estoque" : "validade";

  const store = visit ? storeById.get(visit.storeId) : undefined;
  const items = useMemo(() => (visit ? sectionItems(visit, section) : []), [visit, section]);
  const lastIds = useMemo(
    () =>
      (store?.lastItems ?? [])
        .filter((i) => i.type === "validity" && (location === "stock" ? i.location === "stock" : i.location !== "stock"))
        .map((i) => i.productId),
    [store, location],
  );
  const marks = useMemo(() => {
    const m: Record<string, ProductMark & { lots: number }> = {};
    for (const o of items) {
      const lots = (m[o.productId]?.lots ?? 0) + 1;
      const s = visit ? sev(o, visit.visitDate) : null;
      const alert = m[o.productId]?.tone === "alert" || s?.severity === "expired" || s?.severity === "critical";
      m[o.productId] = { lots, label: lots === 1 ? `${o.quantity} ${o.unit}` : `${lots} lotes`, tone: alert ? "alert" : "done" };
    }
    return m;
  }, [items, visit, sev]);

  if (!visit) return <MissingVisit />;
  const title = location === "stock" ? "Estoque" : "Área de vendas";

  return (
    <div className="min-h-dvh pb-28">
      <TopBar title={title} subtitle={`Validades · ${storeTitle(store)}`} onBack={() => back(`visita/${visitId}`)} />
      <div className="max-w-xl mx-auto px-4 pt-3 space-y-4">
        {items.length ? (
          <section>
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-2">Registrados agora · {items.length}</h2>
            <ul className="rounded-2xl bg-surface border border-line divide-y divide-line overflow-hidden">
              {items.map((o) => {
                const product = productById.get(o.productId);
                const s = sev(o, visit.visitDate);
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => product && setTarget({ product, existing: o, location })}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-navy-50"
                    >
                      <span className="w-1 self-stretch rounded-full" style={{ background: s ? SEVERITY_COLOR[s.severity].solid : "#ccc" }} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-semibold text-ink truncate">{product?.name ?? "Produto"}</span>
                        <span className="block text-[13px] text-ink-2 tnum">
                          {o.quantity} {o.unit} · val. {formatIsoBr(o.expiryDate, false)}
                          {s ? ` · ${describeDays(s.days)}` : ""}
                          {o.price != null ? ` · ${brl(o.price)}` : ""}
                          {o.photos.length ? (
                            <span className="inline-flex items-center gap-0.5 ml-1.5 text-muted">
                              <Camera className="size-3.5" />
                              {o.photos.length}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      {s ? <SeverityBadge severity={s.severity} size="sm" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-1">{items.length ? "Adicionar outro produto" : "Escolha o produto"}</h2>
          <ProductList store={store} marks={marks} priorityIds={lastIds} onPick={(p) => setTarget({ product: p, location })} />
        </section>
      </div>

      <BottomBar>
        <button type="button" onClick={() => back(`visita/${visitId}`)} className="h-14 flex-1 rounded-2xl bg-navy-900 text-white font-semibold text-[16px]">
          Concluir seção{items.length ? ` · ${items.length}` : ""}
        </button>
      </BottomBar>

      <ValiditySheet
        visitId={visitId}
        visitDate={visit.visitDate}
        target={target}
        onClose={() => setTarget(null)}
        onSaved={({ anotherLot, product }) => setTarget(anotherLot ? { product, location } : null)}
      />
    </div>
  );
}

// ───────────────────────────── Ruptura ─────────────────────────────

/** Ruptura é só "ruptura total": tocar no produto marca, tocar de novo desmarca. */
export function RuptureScreen({ visitId }: { visitId: string }) {
  const visit = useVisit(visitId);
  const { storeById } = useCatalog();
  const items = useMemo(() => (visit ? sectionItems(visit, "ruptura") : []), [visit]);
  const marks = useMemo(() => Object.fromEntries(items.map((o) => [o.productId, { label: "Ruptura total", tone: "alert" as const }])), [items]);
  if (!visit) return <MissingVisit />;
  const store = storeById.get(visit.storeId);
  const byProduct = new Map(items.map((o) => [o.productId, o]));

  return (
    <div className="min-h-dvh pb-28">
      <TopBar title="Ruptura" subtitle={storeTitle(store)} onBack={() => back(`visita/${visitId}`)} />
      <div className="max-w-xl mx-auto px-4 pt-3 space-y-3">
        <p className="text-[14px] text-ink-2">
          Toque nos produtos do mix que <b>estão em falta</b>. Para desmarcar, toque de novo.
        </p>
        <ProductList
          store={store}
          marks={marks}
          onPick={async (p) => {
            const occ = byProduct.get(p.id);
            if (occ) {
              await deleteOccurrence(visitId, occ.id);
              haptic(30);
            } else {
              await saveOccurrence(visitId, { productId: p.id, type: "rupture", location: "sales_floor", unit: "un", ruptureKind: "total" });
              haptic();
            }
          }}
        />
      </div>
      <BottomBar>
        <button type="button" onClick={() => back(`visita/${visitId}`)} className="h-14 flex-1 rounded-2xl bg-navy-900 text-white font-semibold text-[16px]">
          {items.length ? `Concluir · ${items.length} em ruptura` : "Concluir seção"}
        </button>
      </BottomBar>
    </div>
  );
}

// ───────────────────────────── Avaria ─────────────────────────────

export function DamageScreen({ visitId }: { visitId: string }) {
  const visit = useVisit(visitId);
  const { storeById, productById } = useCatalog();
  const [target, setTarget] = useState<SheetTarget | null>(null);
  if (!visit) return <MissingVisit />;
  const store = storeById.get(visit.storeId);
  const items = sectionItems(visit, "avaria");
  return (
    <div className="min-h-dvh pb-28">
      <TopBar title="Avaria" subtitle={storeTitle(store)} onBack={() => back(`visita/${visitId}`)} />
      <div className="max-w-xl mx-auto px-4 pt-3 space-y-4">
        {items.length ? (
          <section>
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-2">Avarias registradas · {items.length}</h2>
            <ul className="rounded-2xl bg-surface border border-line divide-y divide-line overflow-hidden">
              {items.map((o) => {
                const product = productById.get(o.productId);
                return (
                  <li key={o.id}>
                    <button type="button" onClick={() => product && setTarget({ product, existing: o })} className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-navy-50">
                      <ShieldAlert className="size-5 text-[#F07C1B] shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-semibold truncate">{product?.name}</span>
                        <span className="block text-[13px] text-ink-2">
                          {o.quantity} un · {o.damageKind ? DAMAGE_KIND_LABEL[o.damageKind] : ""}{o.expiryDate ? ` · val. ${formatIsoBr(o.expiryDate, false)}` : ""} · {o.photos.length} foto{o.photos.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <ChevronRight className="size-5 text-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-1">Qual produto está avariado?</h2>
          <ProductList store={store} onPick={(p) => setTarget({ product: p })} />
        </section>
      </div>
      <BottomBar>
        <button type="button" onClick={() => back(`visita/${visitId}`)} className="h-14 flex-1 rounded-2xl bg-navy-900 text-white font-semibold text-[16px]">
          Concluir seção
        </button>
      </BottomBar>
      <DamageSheet visitId={visitId} visitDate={visit.visitDate} target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
