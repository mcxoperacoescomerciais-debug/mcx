"use client";

/**
 * Painel lateral de ocorrência: fotos, dados, histórico de tratamento e
 * mudança de status. Abre de qualquer tabela do painel via <OpenOccurrence>.
 */
import { createContext, useCallback, useContext, useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import clsx from "clsx";
import { Badge, SeverityBadge } from "@/components/ui";
import {
  DAMAGE_KIND_LABEL,
  LOCATION_LABEL,
  OCCURRENCE_STATUS_LABEL,
  OCCURRENCE_TYPE_LABEL,
  RUPTURE_KIND_LABEL,
  type DamageKind,
  type Location,
  type OccurrenceStatus,
  type OccurrenceType,
  type RuptureKind,
  type Severity,
} from "@/lib/domain";
import { daysBetween, describeDays, formatIsoBr, todayIso } from "@/lib/validity";
import type { OccurrenceDetail } from "@/server/occurrences";
import { changeStatusAction, loadOccurrenceAction } from "../actions";

const Ctx = createContext<{ open: (id: string) => void }>({ open: () => {} });

export function OccurrenceDrawerProvider({ children, canManage }: { children: ReactNode; canManage: boolean }) {
  const [id, setId] = useState<string | null>(null);
  const open = useCallback((next: string) => setId(next), []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {id ? <Drawer key={id} id={id} canManage={canManage} onClose={() => setId(null)} /> : null}
    </Ctx.Provider>
  );
}

export function OpenOccurrence({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const { open } = useContext(Ctx);
  return (
    <button type="button" onClick={() => open(id)} className={clsx("text-left", className)}>
      {children}
    </button>
  );
}

export const STATUS_TONE: Record<OccurrenceStatus, "red" | "orange" | "green" | "neutral"> = {
  open: "red",
  analyzing: "orange",
  resolved: "green",
  ignored: "neutral",
};

const QUICK_ACTIONS = [
  "Produto retirado da área de vendas",
  "Rebaixa de preço negociada com a loja",
  "Produto trocado / devolvido",
  "Gerente da loja informado",
  "Reposição solicitada",
];

function Drawer({ id, canManage, onClose }: { id: string; canManage: boolean; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<OccurrenceDetail | null | undefined>(undefined);
  const [status, setStatus] = useState<OccurrenceStatus>("open");
  const [text, setText] = useState("");
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadOccurrenceAction(id).then((d) => {
      if (!alive) return;
      setData(d);
      if (d) setStatus(d.status === "open" ? "analyzing" : d.status);
    });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      document.removeEventListener("keydown", onKey);
    };
  }, [id, onClose]);

  const today = todayIso();
  const daysNow = data?.expiryDate ? daysBetween(today, data.expiryDate) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-navy-950/40" onClick={onClose} />
      <aside className="relative w-full max-w-[520px] h-full bg-surface shadow-[var(--shadow-pop)] flex flex-col">
        <header className="flex items-start justify-between gap-3 px-6 py-5 border-b border-line">
          <div className="min-w-0">
            {data ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone="navy">{OCCURRENCE_TYPE_LABEL[data.type as OccurrenceType]}</Badge>
                  <Badge tone={STATUS_TONE[data.status]}>{OCCURRENCE_STATUS_LABEL[data.status]}</Badge>
                </div>
                <h2 className="text-[19px] font-semibold text-ink mt-2 leading-snug">{data.productName}</h2>
                <p className="text-[13px] text-muted">
                  <Link href={`/painel/lojas/${data.storeId}`} className="hover:underline">
                    {data.storeName}
                    {data.storeCode ? ` · ${data.storeCode}` : ""}
                  </Link>{" "}
                  · {data.city}
                </p>
              </>
            ) : (
              <h2 className="text-[17px] font-semibold">Ocorrência</h2>
            )}
          </div>
          <button type="button" onClick={onClose} className="size-9 grid place-items-center rounded-lg text-muted hover:bg-navy-50" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {data === undefined ? (
            <Loader2 className="size-6 animate-spin text-muted mx-auto mt-10" />
          ) : data === null ? (
            <p className="text-muted">Ocorrência não encontrada.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13.5px]">
                {data.quantity !== null ? (
                  <Field label="Quantidade" value={`${data.quantity} ${data.unit}`} />
                ) : null}
                {data.expiryDate ? <Field label="Validade" value={formatIsoBr(data.expiryDate)} /> : null}
                {data.daysToExpiry !== null ? (
                  <div>
                    <dt className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Na visita</dt>
                    <dd className="mt-0.5">
                      <SeverityBadge severity={data.severity as Severity} days={data.daysToExpiry} size="sm" />
                    </dd>
                  </div>
                ) : null}
                {daysNow !== null ? <Field label="Hoje" value={describeDays(daysNow)} /> : null}
                {data.type === "validity" ? <Field label="Local" value={LOCATION_LABEL[data.location as Location]} /> : null}
                {data.price ? <Field label="Preço" value={`R$ ${Number(data.price).toFixed(2).replace(".", ",")}`} /> : null}
                {data.lot ? <Field label="Lote" value={data.lot} /> : null}
                {data.ruptureKind ? <Field label="Situação" value={RUPTURE_KIND_LABEL[data.ruptureKind as RuptureKind]} /> : null}
                {data.damageKind ? <Field label="Tipo de avaria" value={DAMAGE_KIND_LABEL[data.damageKind as DamageKind]} /> : null}
                <Field label="Visita" value={formatIsoBr(data.visitDate)} href={`/painel/visitas/${data.visitId}`} />
                <Field label="Promotor" value={data.promoterName} />
                {data.productCode ? <Field label="Código SUINCO" value={data.productCode} href={`/painel/produtos/${data.productId}`} /> : null}
              </dl>
              {data.notes ? <p className="text-[13.5px] bg-navy-50 rounded-lg px-3 py-2">{data.notes}</p> : null}

              {data.photos.length ? (
                <section>
                  <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-2">Fotos</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {data.photos.map((p) => (
                      <button key={p} type="button" onClick={() => setPhoto(p)} className="aspect-square rounded-lg overflow-hidden bg-navy-50 border border-line">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/photos/${p}`} alt="Foto da ocorrência" className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-2">Tratamento</h3>
                {data.actions.length ? (
                  <ol className="relative border-l border-line ml-1.5 space-y-3">
                    {data.actions.map((a) => (
                      <li key={a.id} className="pl-4">
                        <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-navy-700" />
                        <p className="text-[13px]">
                          <b>{OCCURRENCE_STATUS_LABEL[a.toStatus as OccurrenceStatus]}</b>
                          {a.actionText ? ` — ${a.actionText}` : ""}
                        </p>
                        <p className="text-[12px] text-muted">
                          {a.responsible ?? "—"} · {new Date(a.createdAt).toLocaleString("pt-BR")}
                          {a.actionDate ? ` · ação em ${formatIsoBr(a.actionDate)}` : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-[13px] text-muted">Nenhuma ação registrada ainda.</p>
                )}
              </section>

              {canManage ? (
                <section className="rounded-xl border border-line p-4 space-y-3 bg-navy-50/40">
                  <h3 className="text-[13px] font-semibold">Registrar ação</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {(["analyzing", "resolved", "ignored", "open"] as OccurrenceStatus[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatus(st)}
                        className={clsx("h-8 px-3 rounded-full text-[12.5px] font-semibold border", status === st ? "bg-navy-900 text-white border-navy-900" : "bg-surface border-line-strong text-ink-2")}
                      >
                        {OCCURRENCE_STATUS_LABEL[st]}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={2}
                    placeholder="Ação tomada (obrigatória para Resolvido/Ignorado)"
                    className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13.5px]"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_ACTIONS.map((q) => (
                      <button key={q} type="button" onClick={() => setText(q)} className="px-2.5 py-1 rounded-full border border-line-strong bg-surface text-[12px] text-ink-2 hover:bg-navy-50">
                        {q}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[12.5px] text-muted" htmlFor="action-date">
                      Data da ação
                    </label>
                    <input id="action-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-lg border border-line-strong px-2 text-[13px]" />
                  </div>
                  {error ? <p className="text-[13px] text-[#B42318] font-semibold">{error}</p> : null}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        setError(null);
                        const r = await changeStatusAction(data.id, status, text, date || null);
                        if (!r.ok) return setError(r.error);
                        const fresh = await loadOccurrenceAction(data.id);
                        setData(fresh);
                        setText("");
                        router.refresh();
                      })
                    }
                    className="h-10 px-4 rounded-lg bg-navy-900 text-white text-[13.5px] font-semibold inline-flex items-center gap-2 disabled:opacity-60"
                  >
                    {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Salvar ação
                  </button>
                </section>
              ) : null}
            </>
          )}
        </div>
      </aside>
      {photo ? (
        <button type="button" onClick={() => setPhoto(null)} className="fixed inset-0 z-[60] bg-navy-950/90 grid place-items-center p-6" aria-label="Fechar foto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/photos/${photo}`} alt="Foto ampliada" className="max-h-full max-w-full rounded-lg" />
        </button>
      ) : null}
    </div>
  );
}

function Field({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div>
      <dt className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">
        {href ? (
          <Link href={href} className="hover:underline text-navy-700">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
