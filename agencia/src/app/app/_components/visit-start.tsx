"use client";

/**
 * Início de visita, com as proteções do fluxo:
 * - mesma programação → retoma a visita existente (nunca duplica);
 * - outra visita aberta → oferece retomar ou encerrar a anterior;
 * - loja sem programação → visita extraordinária com justificativa e marcas escolhidas.
 */
import { useState } from "react";
import { AlertTriangle, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui";
import { openVisit, startVisit } from "../_lib/local-store";
import { go, haptic, useCatalog, useLocal } from "../_lib/hooks";
import { Chip, Sheet, TextArea, toast } from "./primitives";
import type { BootstrapSchedule, BootstrapStore } from "@/lib/sync-types";

type Pending = { kind: "conflict"; openVisitId: string; target: () => Promise<void> } | { kind: "extra"; store: BootstrapStore } | null;

export function useStartVisit() {
  const { settings, storeById } = useCatalog();
  const local = useLocal();
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  async function doStart(storeId: string, scheduleId: string | null, plannedBrandIds: string[], extraReason?: string) {
    setBusy(true);
    try {
      const id = await startVisit({ storeId, scheduleId, plannedBrandIds, extraReason, captureLocation: settings?.captureLocation ?? false });
      haptic(20);
      go(`visita/${id}`);
    } finally {
      setBusy(false);
    }
  }

  function guard(run: () => Promise<void>, sameVisitId?: string) {
    const open = openVisit();
    if (open && open.id !== sameVisitId) {
      setPending({ kind: "conflict", openVisitId: open.id, target: run });
      return;
    }
    void run();
  }

  function startScheduled(schedule: BootstrapSchedule) {
    const existing = Object.values(local.visits).find((v) => v.scheduleId === schedule.id && v.status !== "cancelled");
    if (existing) return go(`visita/${existing.id}`);
    const store = storeById.get(schedule.storeId);
    const planned = schedule.brandIds.filter((b) => store?.brandIds.includes(b));
    guard(() => doStart(schedule.storeId, schedule.id, planned));
  }

  function startExtra(store: BootstrapStore) {
    if (!settings?.allowExtraVisits) {
      toast("Visitas fora da programação não estão liberadas. Fale com o gestor.", "warn");
      return;
    }
    guard(async () => setPending({ kind: "extra", store }));
  }

  const openStore = pending?.kind === "conflict" ? storeById.get(local.visits[pending.openVisitId]?.storeId ?? "") : undefined;

  const sheets = (
    <>
      <Sheet open={pending?.kind === "conflict"} onClose={() => setPending(null)} title="Você tem uma visita aberta">
        {pending?.kind === "conflict" ? (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-2xl bg-warn-bg text-warn px-4 py-3">
              <AlertTriangle className="size-5 shrink-0 mt-0.5" />
              <p className="text-[14px] font-medium">
                A visita em <strong>{openStore?.name ?? "outra loja"}</strong> ainda não foi encerrada. Só é possível ter uma visita aberta por vez.
              </p>
            </div>
            <Button size="xl" className="w-full" onClick={() => go(`visita/${pending.openVisitId}`)}>
              Retomar visita em aberto
            </Button>
            <Button size="lg" variant="secondary" className="w-full" onClick={() => go(`visita/${pending.openVisitId}/encerrar`)}>
              Ir encerrar a visita anterior
            </Button>
          </div>
        ) : null}
      </Sheet>
      {pending?.kind === "extra" ? <ExtraVisitSheet store={pending.store} busy={busy} onClose={() => setPending(null)} onConfirm={(brands, reason) => doStart(pending.store.id, null, brands, reason)} /> : null}
    </>
  );

  return { startScheduled, startExtra, sheets, busy };
}

function ExtraVisitSheet({ store, busy, onClose, onConfirm }: { store: BootstrapStore; busy: boolean; onClose: () => void; onConfirm: (brandIds: string[], reason: string) => void }) {
  const { brandById } = useCatalog();
  const [brands, setBrands] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const valid = brands.length > 0 && reason.trim().length >= 5;
  return (
    <Sheet
      open
      onClose={onClose}
      title="Visita fora da programação"
      footer={
        <Button size="xl" className="w-full" disabled={!valid || busy} onClick={() => onConfirm(brands, reason.trim())}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : null}
          Iniciar visita extraordinária
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex items-start gap-2 text-[14px] text-ink-2">
          <MapPin className="size-4 mt-0.5 shrink-0 text-muted" />
          <span>
            <strong className="text-ink">{store.name}</strong> não está no seu roteiro de hoje. A visita fica identificada como extraordinária para o gestor.
          </span>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-ink-2 mb-2">Quais marcas você vai atender?</p>
          <div className="flex flex-wrap gap-2">
            {store.brandIds.map((b) => (
              <Chip key={b} selected={brands.includes(b)} onClick={() => setBrands((x) => (x.includes(b) ? x.filter((y) => y !== b) : [...x, b]))}>
                {brandById.get(b)?.name ?? "Marca"}
              </Chip>
            ))}
          </div>
        </div>
        <TextArea label="Motivo da visita (obrigatório)" value={reason} onChange={setReason} placeholder="Ex.: gestor pediu cobertura de outro promotor" rows={2} />
      </div>
    </Sheet>
  );
}
