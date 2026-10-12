"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, CloudUpload, Flag, Loader2, MapPin, MapPinOff, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Button, StatusBadge } from "@/components/ui";
import { ATTENDANCE_STATUS_LABEL, ATTENDANCE_STATUS_TONE } from "@/lib/domain";
import { fmtDuration, fmtTime } from "@/lib/dates";
import { addPlannedBrand, discardVisit, finishVisit, pendingPhotos, removeBlockedVisit, setVisitNotes, startAttendance } from "../_lib/local-store";
import { go, haptic, useCatalog, useVisit } from "../_lib/hooks";
import { brandSlots, isDoneStatus, stopStatus, STOP_STATUS_LABEL, STOP_STATUS_TONE } from "../_lib/derive";
import { Notice, Screen, SectionTitle, Sheet, TextArea, toast, TopBar } from "./primitives";

export function VisitScreen({ visitId, closing = false }: { visitId: string; closing?: boolean }) {
  const visit = useVisit(visitId);
  const cat = useCatalog();
  const [closeOpen, setCloseOpen] = useState(closing);
  const [addOpen, setAddOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  if (!visit) {
    return (
      <Screen>
        <TopBar title="Visita" back="" />
        <p className="p-6 text-center text-muted">Visita não encontrada neste aparelho.</p>
      </Screen>
    );
  }
  const store = cat.storeById.get(visit.storeId);
  const schedule = visit.scheduleId ? cat.scheduleById.get(visit.scheduleId) : undefined;
  const slots = brandSlots(visit, schedule?.brandIds ?? visit.plannedBrandIds);
  const open = visit.status === "in_progress";
  const extraBrands = (store?.brandIds ?? []).filter((b) => !slots.some((s) => s.brandId === b));
  const done = slots.filter((s) => isDoneStatus(s.status)).length;
  const status = stopStatus(visit);

  async function openBrand(brandId: string) {
    const slot = slots.find((s) => s.brandId === brandId);
    if (slot?.attendance) return go(`visita/${visitId}/marca/${slot.attendance.id}`);
    if (!open) return;
    const id = await startAttendance(visitId, brandId);
    haptic(20);
    go(`visita/${visitId}/marca/${id}`);
  }

  return (
    <Screen
      footer={
        open ? (
          <Button size="xl" className="w-full" onClick={() => setCloseOpen(true)}>
            <Flag className="size-5" /> FINALIZAR VISITA
          </Button>
        ) : undefined
      }
    >
      <TopBar title={store?.name ?? "Visita"} subtitle={[store?.chainName, store?.city].filter(Boolean).join(" · ")} back="" />

      <div className="px-4 pt-4 space-y-3">
        <div className="bg-surface border border-line rounded-2xl p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge tone={STOP_STATUS_TONE[status]}>{STOP_STATUS_LABEL[status]}</StatusBadge>
            {visit.origin === "extra" ? <StatusBadge tone="muted" icon={false}>Extraordinária</StatusBadge> : null}
            <span className="ml-auto text-[13px] text-muted tnum">
              {done}/{slots.length} marcas
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-3 mt-3 text-[14px]">
            <div>
              <dt className="text-[12px] text-muted">Início</dt>
              <dd className="font-semibold tnum">{fmtTime(visit.startedAt)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">{visit.finishedAt ? "Encerramento" : "Em loja há"}</dt>
              <dd className="font-semibold tnum">{visit.finishedAt ? fmtTime(visit.finishedAt) : fmtDuration(visit.startedAt, new Date())}</dd>
            </div>
          </dl>
          <p className="text-[12px] text-muted mt-3 flex items-center gap-1.5">
            {visit.geo?.status === "captured" ? (
              <>
                <MapPin className="size-3.5" /> Localização registrada no início (±{visit.geo.accuracy} m)
              </>
            ) : visit.geo?.status === "denied" ? (
              <>
                <MapPinOff className="size-3.5" /> Localização não autorizada no aparelho
              </>
            ) : visit.geo === null ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Obtendo localização…
              </>
            ) : null}
          </p>
        </div>

        {visit.serverError ? <Notice tone="bad" icon={<AlertTriangle className="size-5" />}>{visit.serverError}</Notice> : null}
        {visit.blocked ? <BlockedVisit visitId={visitId} /> : null}
        {visit.status === "closed_incomplete" ? (
          <Notice tone="warn" icon={<AlertTriangle className="size-5" />}>
            Encerrada com marca pendente. Justificativa: “{visit.closeReason}”
          </Notice>
        ) : null}
        {pendingPhotos(visit) > 0 ? (
          <Notice tone="sync" icon={<CloudUpload className="size-5" />}>
            {pendingPhotos(visit)} {pendingPhotos(visit) === 1 ? "foto aguardando" : "fotos aguardando"} envio. Fica salva no celular até o servidor confirmar.
          </Notice>
        ) : null}
      </div>

      <SectionTitle>Marcas desta loja</SectionTitle>
      <div className="px-4 space-y-2.5">
        {slots.map((slot) => {
          const brand = cat.brandById.get(slot.brandId);
          const a = slot.attendance;
          return (
            <button
              key={slot.brandId}
              type="button"
              onClick={() => void openBrand(slot.brandId)}
              disabled={!a && !open}
              className={clsx("w-full text-left bg-surface border rounded-2xl p-4 active:bg-canvas disabled:opacity-60", slot.status === "in_progress" ? "border-info/40" : slot.status === "correction_requested" ? "border-bad/40" : "border-line")}
            >
              <div className="flex items-center gap-3">
                <span
                  className={clsx(
                    "size-11 rounded-xl grid place-items-center text-[15px] font-bold shrink-0",
                    isDoneStatus(slot.status) ? "bg-ok-bg text-ok" : slot.status === "in_progress" ? "bg-info-bg text-info" : "bg-canvas text-ink-2",
                  )}
                >
                  {isDoneStatus(slot.status) ? <CheckCircle2 className="size-6" /> : (brand?.name ?? "?").slice(0, 2).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[16px] truncate">{brand?.name ?? "Marca"}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge tone={ATTENDANCE_STATUS_TONE[slot.status]} size="sm">
                      {ATTENDANCE_STATUS_LABEL[slot.status]}
                    </StatusBadge>
                    {!slot.planned ? <span className="text-[11px] text-muted">fora da programação</span> : null}
                  </div>
                  {a?.serverError ? <p className="text-[12.5px] text-bad mt-1.5 font-medium">{a.serverError}</p> : null}
                </div>
                {!a && open ? <span className="text-[13px] font-bold text-brand-800 shrink-0">INICIAR</span> : <ChevronRight className="size-5 text-muted shrink-0" />}
              </div>
              {a && (a.status === "completed" || a.status === "cancelled") ? (
                <p className="text-[12px] text-muted mt-2 tnum">
                  {fmtTime(a.startedAt)}–{fmtTime(a.finishedAt)} · {Object.keys(a.validities ?? {}).length} validade(s) · {Object.keys(a.ruptures).length} ruptura(s) · {Object.keys(a.damages ?? {}).length} avaria(s)
                </p>
              ) : null}
              {a && a.status === "completed" ? (
                <p className="mt-2 text-[13px] font-bold text-ok">Toque para enviar o PDF no WhatsApp</p>
              ) : null}
            </button>
          );
        })}
        {open && extraBrands.length ? (
          <button type="button" onClick={() => setAddOpen(true)} className="w-full h-12 rounded-2xl border border-dashed border-line-strong text-[14px] font-semibold text-ink-2 flex items-center justify-center gap-2 active:bg-surface">
            <Plus className="size-4" /> Atender outra marca autorizada
          </button>
        ) : null}
      </div>

      <SectionTitle>Observações da visita</SectionTitle>
      <div className="px-4">
        {open ? (
          <TextArea value={visit.notes} onChange={(v) => void setVisitNotes(visitId, v)} placeholder="Opcional — algo sobre a loja como um todo" rows={2} />
        ) : (
          <p className="text-[14px] text-ink-2 bg-surface border border-line rounded-2xl p-4">{visit.notes || "Nenhuma observação."}</p>
        )}
        {open && Object.keys(visit.attendances).length === 0 ? (
          <button type="button" onClick={() => setDiscardOpen(true)} className="mt-6 mx-auto flex items-center gap-1.5 text-[13px] text-muted font-medium">
            <Trash2 className="size-4" /> Iniciei esta visita por engano
          </button>
        ) : null}
      </div>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Atender outra marca">
        <p className="text-[14px] text-muted mb-3">Marcas autorizadas para você nesta loja, fora da programação de hoje.</p>
        <div className="space-y-2">
          {extraBrands.map((b) => (
            <button
              key={b}
              type="button"
              onClick={async () => {
                await addPlannedBrand(visitId, b);
                setAddOpen(false);
                await openBrand(b);
              }}
              className="w-full h-14 rounded-2xl border border-line-strong px-4 text-left font-semibold text-[15px] active:bg-canvas"
            >
              {cat.brandById.get(b)?.name}
            </button>
          ))}
        </div>
      </Sheet>

      <DiscardSheet open={discardOpen} onClose={() => setDiscardOpen(false)} visitId={visitId} />
      {closeOpen && open ? <CloseVisitSheet visitId={visitId} onClose={() => setCloseOpen(false)} /> : null}
    </Screen>
  );
}

function BlockedVisit({ visitId }: { visitId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className="text-[13px] text-ink-2">O servidor recusou esta visita e ela não será enviada. Fale com o gestor; depois, se ele orientar, remova-a deste celular.</p>
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Remover visita recusada deste celular
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Remover visita recusada?"
        footer={
          <Button
            size="lg"
            variant="danger"
            className="w-full"
            onClick={async () => {
              await removeBlockedVisit(visitId);
              toast("Visita recusada removida do celular.");
              go("", true);
            }}
          >
            Remover definitivamente
          </Button>
        }
      >
        <p className="text-[14px] text-ink-2">Os registros desta visita existem só neste celular e foram recusados pelo servidor. Esta ação não pode ser desfeita.</p>
      </Sheet>
    </>
  );
}

function DiscardSheet({ open, onClose, visitId }: { open: boolean; onClose: () => void; visitId: string }) {
  const [reason, setReason] = useState("");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Descartar visita"
      footer={
        <Button
          size="lg"
          variant="danger"
          className="w-full"
          disabled={reason.trim().length < 5}
          onClick={async () => {
            await discardVisit(visitId, reason.trim());
            toast("Visita descartada.");
            go("", true);
          }}
        >
          Descartar visita
        </Button>
      }
    >
      <p className="text-[14px] text-ink-2 mb-3">Só é possível porque nenhuma marca foi iniciada. O gestor verá o motivo.</p>
      <TextArea label="Motivo" value={reason} onChange={setReason} placeholder="Ex.: toquei na loja errada" rows={2} />
    </Sheet>
  );
}

function CloseVisitSheet({ visitId, onClose }: { visitId: string; onClose: () => void }) {
  const visit = useVisit(visitId)!;
  const cat = useCatalog();
  const [reason, setReason] = useState("");
  const schedule = visit.scheduleId ? cat.scheduleById.get(visit.scheduleId) : undefined;
  const slots = brandSlots(visit, schedule?.brandIds ?? visit.plannedBrandIds);
  const planned = slots.filter((s) => s.planned);
  const inProgress = slots.filter((s) => s.status === "in_progress" || s.status === "correction_requested");
  const pending = slots.filter((s) => s.status === "pending");
  const completed = slots.filter((s) => isDoneStatus(s.status));
  const withException = Object.values(visit.attendances).filter((a) => a.exceptionItems.length);
  const ruptures = Object.values(visit.attendances).reduce((n, a) => n + Object.keys(a.ruptures).length, 0);
  const unsynced = pendingPhotos(visit) + Object.values(visit.attendances).filter((a) => a.rev > a.syncedRev).length;
  const allowIncomplete = cat.settings?.allowIncompleteVisit ?? false;
  const name = (id: string) => cat.brandById.get(id)?.name ?? "Marca";

  const blocked = inProgress.length > 0 || (pending.length > 0 && !allowIncomplete);
  const needsReason = pending.length > 0;
  const canClose = !blocked && (!needsReason || reason.trim().length >= 5);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Resumo antes de encerrar"
      footer={
        <Button
          size="xl"
          variant={needsReason ? "danger" : "primary"}
          className="w-full"
          disabled={!canClose}
          onClick={async () => {
            await finishVisit(visitId, needsReason ? reason.trim() : null);
            haptic(30);
            toast(needsReason ? "Visita encerrada com pendência justificada." : "Visita encerrada.");
            go("", true);
          }}
        >
          {needsReason ? "Encerrar com marca pendente" : "ENCERRAR VISITA"}
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <SummaryBox label="Previstas" value={planned.length} />
        <SummaryBox label="Concluídas" value={completed.length} tone="ok" />
        <SummaryBox label="Pendentes" value={pending.length + inProgress.length} tone={pending.length + inProgress.length ? "bad" : undefined} />
      </div>
      <ul className="mt-4 space-y-2 text-[14px]">
        <li className="flex justify-between">
          <span className="text-muted">Rupturas registradas</span>
          <span className="font-semibold tnum">{ruptures}</span>
        </li>
        <li className="flex justify-between">
          <span className="text-muted">Atendimentos com exceção</span>
          <span className="font-semibold tnum">{withException.length}</span>
        </li>
        <li className="flex justify-between">
          <span className="text-muted">Aguardando sincronização</span>
          <span className="font-semibold tnum">{unsynced}</span>
        </li>
        <li className="flex justify-between">
          <span className="text-muted">Observações da visita</span>
          <span className="font-semibold">{visit.notes ? "Sim" : "Não"}</span>
        </li>
      </ul>

      <div className="mt-4 space-y-3">
        {inProgress.length ? (
          <Notice tone="bad" icon={<AlertTriangle className="size-5" />}>
            Finalize o atendimento de <strong>{inProgress.map((s) => name(s.brandId)).join(", ")}</strong> antes de encerrar a visita.
          </Notice>
        ) : null}
        {pending.length ? (
          <Notice tone="warn" icon={<AlertTriangle className="size-5" />}>
            Marca(s) prevista(s) ainda não atendida(s): <strong>{pending.map((s) => name(s.brandId)).join(", ")}</strong>.
            {allowIncomplete ? " Para encerrar mesmo assim, explique o motivo — o gestor será sinalizado." : " A operação não permite encerrar com marca pendente."}
          </Notice>
        ) : null}
        {needsReason && allowIncomplete && !inProgress.length ? (
          <TextArea label="Justificativa (obrigatória)" value={reason} onChange={setReason} placeholder="Ex.: setor em reforma, gerente pediu para voltar amanhã" rows={2} />
        ) : null}
        {unsynced > 0 ? <p className="text-[13px] text-muted">Tudo continua salvo no celular e será enviado automaticamente quando houver sinal.</p> : null}
      </div>
    </Sheet>
  );
}

function SummaryBox({ label, value, tone }: { label: string; value: number; tone?: "ok" | "bad" }) {
  return (
    <div className={clsx("rounded-2xl py-3", tone === "ok" ? "bg-ok-bg text-ok" : tone === "bad" ? "bg-bad-bg text-bad" : "bg-canvas text-ink")}>
      <p className="text-[22px] font-semibold tnum leading-none">{value}</p>
      <p className="text-[12px] mt-1">{label}</p>
    </div>
  );
}

