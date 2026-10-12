"use client";

/**
 * Atendimento de UMA marca — fluxo guiado em etapas. Cada etapa grava na hora
 * (no celular), então o promotor pode sair e voltar sem perder nada.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Ban, Check, CheckCircle2, CloudUpload, Lock, PencilLine } from "lucide-react";
import clsx from "clsx";
import { Button, StatusBadge } from "@/components/ui";
import {
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_STATUS_TONE,
  EXCEPTION_ITEM_LABEL,
  EXCEPTION_REASON_LABEL,
  EXCEPTION_REASONS,
  RUPTURE_SITUATION_LABEL,
  type ExceptionItem,
  type ExceptionReason,
} from "@/lib/domain";
import { fmtDate, fmtDuration, fmtTime } from "@/lib/dates";
import { exceptionIsValid } from "@/lib/rules";
import { attendanceDisplayStatus, cancelAttendance, finishAttendance, updateAttendance, type LocalAttendance } from "../_lib/local-store";
import { go, haptic, useCatalog, useLocal, useVisit } from "../_lib/hooks";
import { missingFor } from "../_lib/derive";
import { Chip, Notice, Screen, Sheet, TextArea, toast, TopBar } from "./primitives";
import { PhotoCapture, PhotoThumb } from "./photo-capture";
import { StockStep } from "./stock-step";
import { RuptureStep } from "./rupture-step";
import { OccurrenceStep } from "./occurrence-step";

const STEPS = [
  { id: "antes", label: "Antes" },
  { id: "execucao", label: "Execução" },
  { id: "depois", label: "Depois" },
  { id: "estoque", label: "Estoque" },
  { id: "ruptura", label: "Ruptura" },
  { id: "ocorrencias", label: "Ocorrências" },
  { id: "revisao", label: "Revisão" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

export function AttendanceScreen({ visitId, attendanceId, step }: { visitId: string; attendanceId: string; step?: string }) {
  const visit = useVisit(visitId);
  const cat = useCatalog();
  const [suggest, setSuggest] = useState<string | null>(null);
  const attendance = visit?.attendances[attendanceId];
  const brand = attendance ? cat.brandById.get(attendance.brandId) : undefined;
  const store = visit ? cat.storeById.get(visit.storeId) : undefined;
  useEffect(() => {
    document.querySelector('[aria-current="step"]')?.scrollIntoView({ inline: "center", block: "nearest" });
    window.scrollTo(0, 0);
  }, [step]);
  const tracked = useMemo(() => (visit && attendance ? cat.trackedProducts(visit.storeId, attendance.brandId) : []), [cat, visit, attendance]);

  if (!visit || !attendance || !brand) {
    return (
      <Screen>
        <TopBar title="Atendimento" back={`visita/${visitId}`} />
        <p className="p-6 text-center text-muted">Atendimento não encontrado neste aparelho.</p>
      </Screen>
    );
  }

  const editable = attendance.status === "in_progress" || attendance.status === "correction_requested";
  const current: StepId = (STEPS.find((s) => s.id === step)?.id ?? (editable ? firstOpenStep(attendance, brand, tracked.length) : "revisao")) as StepId;
  const idx = STEPS.findIndex((s) => s.id === current);
  const status = attendanceDisplayStatus(attendance);
  const goStep = (id: StepId) => go(`visita/${visitId}/marca/${attendanceId}/${id}`, true);
  const allowExceptions = cat.settings?.allowExceptions ?? false;

  const stepDone: Record<StepId, boolean> = {
    antes: attendance.photos.filter((p) => p.kind === "before").length >= brand.minBeforePhotos || attendance.exceptionItems.includes("before_photo"),
    execucao: brand.activities.length === 0 || attendance.activitiesDone.length === brand.activities.length,
    depois: attendance.photos.filter((p) => p.kind === "after").length >= brand.minAfterPhotos || attendance.exceptionItems.includes("after_photo"),
    estoque: !brand.requireStock || tracked.every((p) => attendance.stock[p.id]) || attendance.exceptionItems.includes("stock"),
    ruptura: true,
    ocorrencias: true,
    revisao: status === "completed" || status === "awaiting_sync",
  };

  return (
    <Screen
      footer={
        current === "revisao" ? undefined : (
          <div className="flex gap-2">
            <Button size="xl" variant="secondary" className="w-16 !px-0" aria-label="Etapa anterior" disabled={idx === 0} onClick={() => goStep(STEPS[idx - 1].id)}>
              <ArrowLeft className="size-5" />
            </Button>
            <Button size="xl" className="flex-1" onClick={() => goStep(STEPS[idx + 1].id)}>
              Próximo: {STEPS[idx + 1].label} <ArrowRight className="size-5" />
            </Button>
          </div>
        )
      }
    >
      <TopBar title={brand.name} subtitle={store?.name} back={`visita/${visitId}`} />

      {/* Indicador de progresso por etapa */}
      <nav className="bg-surface border-b border-line sticky top-14 z-20" aria-label="Etapas do atendimento">
        <ol className="max-w-[560px] mx-auto flex overflow-x-auto px-2 py-2 gap-1">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => goStep(s.id)}
                aria-current={s.id === current ? "step" : undefined}
                className={clsx(
                  "h-9 pl-1.5 pr-2.5 rounded-full flex items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap",
                  s.id === current ? "bg-brand-800 text-white" : stepDone[s.id] && s.id !== "ruptura" && s.id !== "ocorrencias" ? "text-ok" : "text-ink-2",
                )}
              >
                <span
                  className={clsx(
                    "size-6 rounded-full grid place-items-center text-[11px]",
                    s.id === current ? "bg-white/20" : stepDone[s.id] && s.id !== "ruptura" && s.id !== "ocorrencias" ? "bg-ok-bg" : "bg-canvas",
                  )}
                >
                  {stepDone[s.id] && s.id !== "ruptura" && s.id !== "ocorrencias" && s.id !== current ? <Check className="size-3.5" /> : i + 1}
                </span>
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="px-4 pt-4 space-y-3">
        {attendance.correction && attendance.status === "correction_requested" ? (
          <Notice tone="bad" icon={<PencilLine className="size-5" />}>
            <strong>Correção solicitada pelo gestor:</strong> “{attendance.correction.reason}”. Ajuste e finalize de novo na Revisão.
          </Notice>
        ) : null}
        {attendance.serverError ? <Notice tone="bad" icon={<AlertTriangle className="size-5" />}>{attendance.serverError}</Notice> : null}
        {!editable ? (
          <Notice tone={status === "awaiting_sync" ? "sync" : "info"} icon={status === "awaiting_sync" ? <CloudUpload className="size-5" /> : <Lock className="size-5" />}>
            {status === "awaiting_sync" ? "Finalizado no celular — aguardando o servidor confirmar." : "Atendimento finalizado. Alterações só com reabertura pelo gestor."}
          </Notice>
        ) : null}
      </div>

      <div className="px-4 pt-3">
        {current === "antes" ? (
          <PhotoCapture
            visitId={visitId}
            attendanceId={attendanceId}
            kind="before"
            photos={attendance.photos.filter((p) => p.kind === "before")}
            min={brand.minBeforePhotos}
            allowGallery={brand.allowGallery}
            editable={editable}
            title="Foto do antes"
            cta="ABRIR CÂMERA E FOTOGRAFAR"
          />
        ) : current === "execucao" ? (
          <ExecutionStep visitId={visitId} attendance={attendance} activities={brand.activities} editable={editable} />
        ) : current === "depois" ? (
          <PhotoCapture
            visitId={visitId}
            attendanceId={attendanceId}
            kind="after"
            photos={attendance.photos.filter((p) => p.kind === "after")}
            min={brand.minAfterPhotos}
            allowGallery={brand.allowGallery}
            editable={editable}
            title="Foto do depois"
            cta="REGISTRAR RESULTADO DA EXECUÇÃO"
          />
        ) : current === "estoque" ? (
          <StockStep
            visitId={visitId}
            storeId={visit.storeId}
            attendance={attendance}
            products={tracked}
            editable={editable}
            onSuggestRupture={(productId) => {
              setSuggest(productId);
              goStep("ruptura");
            }}
          />
        ) : current === "ruptura" ? (
          <RuptureStep
            key={suggest ?? "none"}
            visitId={visitId}
            storeName={store?.name ?? ""}
            attendance={attendance}
            brand={brand}
            products={cat.productsByBrand.get(brand.id) ?? []}
            editable={editable}
            suggestProductId={suggest}
            onSuggestHandled={() => setSuggest(null)}
          />
        ) : current === "ocorrencias" ? (
          <OccurrenceStep visitId={visitId} attendance={attendance} brand={brand} editable={editable} />
        ) : (
          <ReviewStep visitId={visitId} attendance={attendance} goStep={goStep} trackedCount={tracked.length} allowExceptions={allowExceptions} />
        )}
      </div>
    </Screen>
  );
}

function firstOpenStep(a: LocalAttendance, brand: { minBeforePhotos: number }, _tracked: number): StepId {
  void _tracked;
  if (a.photos.filter((p) => p.kind === "before").length < brand.minBeforePhotos) return "antes";
  if (a.photos.some((p) => p.kind === "after")) return "estoque";
  return "execucao";
}

function ExecutionStep({ visitId, attendance, activities, editable }: { visitId: string; attendance: LocalAttendance; activities: string[]; editable: boolean }) {
  const toggle = (act: string) => {
    const done = attendance.activitiesDone.includes(act) ? attendance.activitiesDone.filter((x) => x !== act) : [...attendance.activitiesDone, act];
    haptic(10);
    void updateAttendance(visitId, attendance.id, { activitiesDone: done });
  };
  return (
    <div>
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-2 mb-2">Execução do trabalho</h2>
      <p className="text-[13px] text-muted mb-3">Marque o que foi feito. Depois registre o resultado na foto do depois.</p>
      {activities.length ? (
        <div className="bg-surface border border-line rounded-2xl divide-y divide-line overflow-hidden">
          {activities.map((act) => {
            const on = attendance.activitiesDone.includes(act);
            return (
              <button key={act} type="button" disabled={!editable} onClick={() => toggle(act)} className="w-full min-h-14 px-4 py-3 flex items-center gap-3 text-left active:bg-canvas" aria-pressed={on}>
                <span className={clsx("size-7 rounded-lg border-2 grid place-items-center shrink-0", on ? "bg-ok border-ok text-white" : "border-line-strong")}>{on ? <Check className="size-4" /> : null}</span>
                <span className={clsx("text-[15px]", on ? "font-semibold" : "")}>{act}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[14px] text-muted bg-surface border border-line rounded-2xl p-4">Esta marca não tem atividades cadastradas. Siga para a foto do depois.</p>
      )}
      <div className="mt-4">
        {editable ? (
          <TextArea label="Observação da execução (opcional)" value={attendance.notes} onChange={(v) => void updateAttendance(visitId, attendance.id, { notes: v })} rows={2} />
        ) : attendance.notes ? (
          <p className="text-[14px] text-ink-2">“{attendance.notes}”</p>
        ) : null}
      </div>
    </div>
  );
}

function ReviewStep({ visitId, attendance, goStep, trackedCount, allowExceptions }: { visitId: string; attendance: LocalAttendance; goStep: (s: StepId) => void; trackedCount: number; allowExceptions: boolean }) {
  const visit = useVisit(visitId)!;
  const cat = useCatalog();
  const local = useLocal();
  const brand = cat.brandById.get(attendance.brandId)!;
  const store = cat.storeById.get(visit.storeId);
  const tracked = cat.trackedProducts(visit.storeId, attendance.brandId);
  const missing = missingFor(attendance, brand, tracked, allowExceptions);
  const editable = attendance.status === "in_progress" || attendance.status === "correction_requested";
  const status = attendanceDisplayStatus(attendance);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const stockCounts = Object.values(attendance.stock).reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.state]: (acc[s.state] ?? 0) + 1 }), {});
  const informed = tracked.filter((p) => attendance.stock[p.id]).length;
  const before = attendance.photos.filter((p) => p.kind === "before");
  const after = attendance.photos.filter((p) => p.kind === "after");
  const ruptures = Object.values(attendance.ruptures);
  const excusable = missing.filter((m) => m.excusable);
  const stepFor: Partial<Record<string, StepId>> = { before_photo: "antes", after_photo: "depois", stock: "estoque", rupture_photo: "ruptura" };

  return (
    <div className="space-y-4 pb-6">
      <section className="bg-surface border border-line rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-[16px]">Revisão do atendimento</h2>
          <StatusBadge tone={ATTENDANCE_STATUS_TONE[status]} size="sm">
            {ATTENDANCE_STATUS_LABEL[status]}
          </StatusBadge>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3 text-[13.5px]">
          <Info label="Loja" value={store?.name} />
          <Info label="Marca" value={brand.name} />
          <Info label="Promotor" value={local.bootstrap?.user.name} />
          <Info label="Data" value={fmtDate(visit.visitDate)} />
          <Info label="Início" value={fmtTime(attendance.startedAt)} />
          <Info label={attendance.finishedAt ? "Finalização" : "Duração até agora"} value={attendance.finishedAt ? fmtTime(attendance.finishedAt) : fmtDuration(attendance.startedAt, new Date())} />
        </dl>
      </section>

      <section className="bg-surface border border-line rounded-2xl p-4">
        <h3 className="text-[13px] font-semibold text-ink-2 mb-2">Fotos</h3>
        <div className="grid grid-cols-2 gap-2">
          {(["antes", "depois"] as const).map((k) => {
            const list = k === "antes" ? before : after;
            return (
              <button key={k} type="button" onClick={() => goStep(k)} className="text-left">
                <p className="text-[12px] font-semibold uppercase text-muted mb-1">{k}</p>
                {list[0] ? <PhotoThumb photo={list[0]} className="w-full aspect-[4/3] rounded-xl" /> : <div className="w-full aspect-[4/3] rounded-xl bg-bad-bg text-bad grid place-items-center text-[12px] font-semibold">Sem foto</div>}
                <p className="text-[12px] text-muted mt-1">{list.length} foto(s)</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="bg-surface border border-line rounded-2xl p-4">
        <button type="button" onClick={() => goStep("estoque")} className="w-full text-left">
          <h3 className="text-[13px] font-semibold text-ink-2 mb-2">Estoque</h3>
          <p className="text-[14px]">
            <strong className="tnum">{informed}</strong> de {trackedCount} produtos informados
            {trackedCount - informed > 0 ? <span className="text-warn font-semibold"> · {trackedCount - informed} pendente(s)</span> : null}
          </p>
          <p className="text-[12.5px] text-muted mt-1">
            {[
              stockCounts.quantity ? `${stockCounts.quantity} com quantidade` : null,
              stockCounts.zero ? `${stockCounts.zero} zero` : null,
              stockCounts.not_found ? `${stockCounts.not_found} não encontrado(s)` : null,
              stockCounts.not_applicable ? `${stockCounts.not_applicable} não se aplica` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Nada informado ainda"}
          </p>
        </button>
      </section>

      <section className="bg-surface border border-line rounded-2xl p-4">
        <button type="button" onClick={() => goStep("ruptura")} className="w-full text-left">
          <h3 className="text-[13px] font-semibold text-ink-2 mb-2">Rupturas ({ruptures.length})</h3>
          {ruptures.length ? (
            <ul className="space-y-1 text-[13.5px]">
              {ruptures.map((r) => (
                <li key={r.id}>
                  <strong>{cat.productById.get(r.productId)?.name}</strong> — {RUPTURE_SITUATION_LABEL[r.situation]}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-muted">Nenhuma ruptura registrada.</p>
          )}
        </button>
      </section>

      <section className="bg-surface border border-line rounded-2xl p-4">
        <button type="button" onClick={() => goStep("ocorrencias")} className="w-full text-left">
          <h3 className="text-[13px] font-semibold text-ink-2 mb-1">Observações e ocorrências</h3>
          <p className="text-[14px]">
            {Object.keys(attendance.occurrences).length} ocorrência(s){attendance.notes ? " · com observação" : ""}
          </p>
        </button>
      </section>

      {attendance.exceptionItems.length ? (
        <Notice tone="warn" icon={<AlertTriangle className="size-5" />}>
          <strong>Exceção registrada:</strong> {attendance.exceptionItems.map((i) => EXCEPTION_ITEM_LABEL[i]).join(", ")} — {attendance.exceptionReason ? EXCEPTION_REASON_LABEL[attendance.exceptionReason] : ""}. “{attendance.exceptionNote}”
          {editable ? (
            <button type="button" onClick={() => void updateAttendance(visitId, attendance.id, { exceptionItems: [], exceptionReason: null, exceptionNote: "" })} className="block mt-1 underline text-[13px]">
              Remover exceção
            </button>
          ) : null}
        </Notice>
      ) : null}

      {editable ? (
        <>
          {missing.length ? (
            <section className="rounded-2xl border-2 border-bad/30 bg-bad-bg/50 p-4">
              <h3 className="font-semibold text-bad text-[15px] flex items-center gap-2">
                <AlertTriangle className="size-5" /> Falta para finalizar
              </h3>
              <ul className="mt-2 space-y-2">
                {missing.map((m) => (
                  <li key={m.kind} className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="text-ink">{m.message}</span>
                    {stepFor[m.kind] ? (
                      <button type="button" onClick={() => goStep(stepFor[m.kind]!)} className="shrink-0 h-9 px-3 rounded-lg bg-surface border border-line-strong text-[13px] font-semibold">
                        Resolver
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {excusable.length && allowExceptions ? (
                <button type="button" onClick={() => setExceptionOpen(true)} className="mt-3 text-[13.5px] font-semibold text-ink-2 underline">
                  Não foi possível cumprir? Registrar exceção justificada
                </button>
              ) : null}
            </section>
          ) : (
            <Notice tone="ok" icon={<CheckCircle2 className="size-5" />}>Tudo pronto. O atendimento pode ser finalizado.</Notice>
          )}

          <Button
            size="xl"
            variant="success"
            className="w-full"
            disabled={missing.length > 0}
            onClick={async () => {
              await finishAttendance(visitId, attendance.id);
              haptic(40);
              toast(local.sync.online ? "Atendimento finalizado. Enviando…" : "Atendimento finalizado no celular. Será enviado quando houver sinal.");
              go(`visita/${visitId}`, true);
            }}
          >
            <CheckCircle2 className="size-6" /> FINALIZAR ATENDIMENTO
          </Button>
          {attendance.status === "in_progress" ? (
            <button type="button" onClick={() => setCancelOpen(true)} className="w-full text-center text-[13px] text-muted font-medium py-2 flex items-center justify-center gap-1.5">
              <Ban className="size-4" /> Não vou atender esta marca hoje (cancelar com justificativa)
            </button>
          ) : null}
        </>
      ) : null}

      {exceptionOpen ? (
        <ExceptionSheet
          items={excusable.map((m) => m.kind as ExceptionItem)}
          initial={attendance}
          onClose={() => setExceptionOpen(false)}
          onSave={async (items, reason, note) => {
            await updateAttendance(visitId, attendance.id, { exceptionItems: items, exceptionReason: reason, exceptionNote: note });
            setExceptionOpen(false);
            toast("Exceção registrada. O gestor verá a justificativa.", "warn");
          }}
        />
      ) : null}
      {cancelOpen ? (
        <CancelSheet
          onClose={() => setCancelOpen(false)}
          onConfirm={async (reason) => {
            await cancelAttendance(visitId, attendance.id, reason);
            toast("Atendimento cancelado com justificativa.", "warn");
            go(`visita/${visitId}`, true);
          }}
        />
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-muted">{label}</dt>
      <dd className="font-semibold truncate tnum">{value ?? "—"}</dd>
    </div>
  );
}

function ExceptionSheet({
  items,
  initial,
  onClose,
  onSave,
}: {
  items: ExceptionItem[];
  initial: LocalAttendance;
  onClose: () => void;
  onSave: (items: ExceptionItem[], reason: ExceptionReason, note: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<ExceptionItem[]>(initial.exceptionItems.length ? initial.exceptionItems : items);
  const [reason, setReason] = useState<ExceptionReason | null>(initial.exceptionReason);
  const [note, setNote] = useState(initial.exceptionNote);
  const valid = selected.length > 0 && exceptionIsValid(reason, note);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Exceção justificada"
      footer={
        <Button size="xl" variant="danger" className="w-full" disabled={!valid} onClick={() => reason && void onSave(selected, reason, note.trim())}>
          Registrar exceção
        </Button>
      }
    >
      <Notice tone="warn">A exceção fica identificada para análise do gestor. Use só quando realmente não for possível cumprir.</Notice>
      <p className="text-[13px] font-semibold text-ink-2 mt-4 mb-2">O que não foi possível?</p>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <Chip key={i} selected={selected.includes(i)} onClick={() => setSelected((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}>
            {EXCEPTION_ITEM_LABEL[i]}
          </Chip>
        ))}
      </div>
      <p className="text-[13px] font-semibold text-ink-2 mt-4 mb-2">Motivo</p>
      <div className="grid gap-2">
        {EXCEPTION_REASONS.map((r) => (
          <Chip key={r} selected={reason === r} onClick={() => setReason(r)}>
            {EXCEPTION_REASON_LABEL[r]}
          </Chip>
        ))}
      </div>
      <div className="mt-4">
        <TextArea label="Explique em poucas palavras (obrigatório)" value={note} onChange={setNote} rows={2} placeholder="Ex.: celular descarregou antes da foto final" />
      </div>
    </Sheet>
  );
}

function CancelSheet({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  return (
    <Sheet
      open
      onClose={onClose}
      title="Cancelar atendimento da marca"
      footer={
        <Button size="xl" variant="danger" className="w-full" disabled={reason.trim().length < 5} onClick={() => void onConfirm(reason.trim())}>
          Cancelar atendimento
        </Button>
      }
    >
      <p className="text-[14px] text-ink-2 mb-3">Os registros feitos até agora ficam guardados. O gestor verá a justificativa.</p>
      <TextArea label="Motivo (obrigatório)" value={reason} onChange={setReason} rows={2} placeholder="Ex.: produto em falta na distribuidora, gôndola em reforma" />
    </Sheet>
  );
}
