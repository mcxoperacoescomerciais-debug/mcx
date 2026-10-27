"use client";

/**
 * Acompanhamento ao vivo no mapa: onde cada promotor está agora (loja da visita
 * aberta ou próxima loja do roteiro), se o app está online e o que já fez hoje.
 * Atualiza sozinho a cada 30 s; cada novidade (chegou, concluiu marca, não
 * atendeu, encerrou a loja) aparece como aviso na tela.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bell, BellOff, CheckCircle2, ChevronDown, CircleSlash, LogIn, LogOut, MapPin, RefreshCw, X } from "lucide-react";
import clsx from "clsx";
import { fmtAgo, fmtTime } from "@/lib/dates";
import type { LiveEvent, LivePromoter, LiveTotals, MapStore } from "@/server/map";
import { OperationsMap } from "./operations-map";

const POLL_MS = 30_000;

const STATUS: Record<LivePromoter["status"], { label: string; cls: string }> = {
  in_store: { label: "Na loja agora", cls: "bg-info-bg text-info" },
  late: { label: "Com atraso", cls: "bg-bad-bg text-bad" },
  between: { label: "Entre lojas", cls: "bg-subtle text-ink-2" },
  not_started: { label: "Ainda não iniciou", cls: "bg-subtle text-ink-2" },
  missed: { label: "Loja não realizada", cls: "bg-bad-bg text-bad" },
  done: { label: "Roteiro concluído", cls: "bg-ok-bg text-ok" },
  no_schedule: { label: "Sem programação", cls: "bg-subtle text-muted" },
};

const EVENT_ICON = { checkin: LogIn, checkout: LogOut, attendance: CheckCircle2, not_attended: CircleSlash } as const;
const EVENT_TONE = { checkin: "text-info", checkout: "text-ink-2", attendance: "text-ok", not_attended: "text-bad" } as const;

type Live = { generatedAt: string; promoters: LivePromoter[]; events: LiveEvent[]; totals: LiveTotals };

export function LiveMap({ stores }: { stores: MapStore[] }) {
  const [data, setData] = useState<Live | null>(null);
  const [error, setError] = useState(false);
  const [toasts, setToasts] = useState<LiveEvent[]>([]);
  const [alertsOn, setAlertsOn] = useState(true);
  const [focus, setFocus] = useState<{ lat: number; lng: number; key: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);
  // Os mesmos filtros da página (marca, rede, promotor, cidade) valem para o acompanhamento.
  const params = useSearchParams();
  const qs = ["brand", "chain", "promoter", "city"].map((k) => (params.get(k) ? `${k}=${encodeURIComponent(params.get(k)!)}` : "")).filter(Boolean).join("&");
  const alertsRef = useRef(alertsOn);
  useEffect(() => {
    alertsRef.current = alertsOn;
  }, [alertsOn]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/map/live${qs ? `?${qs}` : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as Live;
      // Na primeira carga tudo já é "visto": avisa só o que acontecer daqui em diante.
      if (seen.current) {
        const fresh = next.events.filter((e) => !seen.current!.has(e.id));
        if (fresh.length && alertsRef.current) setToasts((t) => [...fresh.slice(0, 5).reverse(), ...t].slice(0, 6));
      }
      seen.current = new Set(next.events.map((e) => e.id));
      setData(next);
      setError(false);
    } catch {
      setError(true);
    }
  }, [qs]);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Cada aviso some sozinho depois de 10 s.
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => setToasts((x) => x.slice(0, -1)), 10_000);
    return () => clearTimeout(t);
  }, [toasts]);

  const promoters = data?.promoters ?? [];
  const inStore = promoters.filter((p) => p.current).length;
  const online = promoters.filter((p) => p.online).length;
  const goTo = (p: LivePromoter) => {
    const t = p.current ?? p.next ?? p.last;
    if (t?.lat != null && t.lng != null) setFocus((old) => ({ lat: t.lat!, lng: t.lng!, key: (old?.key ?? 0) + 1 }));
  };

  const t = data?.totals;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Count label="Promotores em loja agora" value={t?.inStore} tone="text-info" />
        <Count label="Lojas concluídas hoje" value={t?.storesDone} tone="text-ok" sub={t ? `de ${t.storesPlanned} programada(s)` : undefined} />
        <Count label="Lojas em andamento" value={t?.storesInProgress} tone="text-info" />
        <Count label="Atendimentos de marca concluídos" value={t?.attendancesDone} />
        <Count label="Promotores online" value={t?.online} sub="app aberto nos últimos 5 min" />
      </div>
      <div className="grid xl:grid-cols-[1fr_370px] gap-4 items-start">
        <OperationsMap stores={stores} live={promoters} focus={focus} />
        <section className="bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden">
          <header className="px-4 py-3 border-b border-line flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-60 animate-ping motion-reduce:hidden" />
              <span className="relative inline-flex size-2.5 rounded-full bg-ok" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold">Promotores agora</h2>
              <p className="text-[12px] text-muted">
                {inStore} na loja · {online} online{data ? ` · atualizado ${fmtTime(data.generatedAt)}` : ""}
                {error ? " · sem conexão, tentando de novo" : ""}
              </p>
            </div>
            <button type="button" onClick={() => setAlertsOn((v) => !v)} className="size-8 grid place-items-center rounded-lg hover:bg-subtle text-ink-2" title={alertsOn ? "Desligar avisos na tela" : "Ligar avisos na tela"} aria-pressed={alertsOn}>
              {alertsOn ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            </button>
            <button type="button" onClick={() => void load()} className="size-8 grid place-items-center rounded-lg hover:bg-subtle text-ink-2" title="Atualizar agora">
              <RefreshCw className="size-4" />
            </button>
          </header>
          <ul className="max-h-[455px] overflow-y-auto divide-y divide-line">
            {!data ? <li className="px-4 py-6 text-[13px] text-muted">Carregando…</li> : null}
            {data && !promoters.length ? <li className="px-4 py-6 text-[13px] text-muted">Nenhum promotor com programação ou atividade hoje.</li> : null}
            {promoters.map((p) => {
              const st = STATUS[p.status];
              const expanded = open === p.promoterId;
              return (
                <li key={p.promoterId} className="px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <span className={clsx("mt-1.5 size-2.5 rounded-full shrink-0", p.online ? "bg-ok" : "bg-line-strong")} title={p.online ? "App online agora" : "App fechado ou sem sinal"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button type="button" onClick={() => goTo(p)} className="font-semibold text-[14px] hover:underline text-left">
                          {p.name}
                        </button>
                        <span className={clsx("text-[11px] font-semibold rounded-full px-2 py-0.5", st.cls)}>{st.label}</span>
                      </div>
                      <p className="text-[12.5px] text-ink-2 mt-0.5">
                        {p.current ? (
                          <>
                            <MapPin className="size-3.5 inline -mt-0.5 text-info" /> <strong>{p.current.storeName}</strong> desde {fmtTime(p.current.since)} · {p.current.brands.filter((b) => b.status === "completed" || b.status === "cancelled").length}/{p.current.brands.length} marcas
                          </>
                        ) : p.next && p.status !== "done" ? (
                          <>
                            Próxima: <strong>{p.next.storeName}</strong>
                            {p.next.plannedStart ? ` · prevista ${p.next.plannedStart}` : ""}
                            {p.next.late ? <span className="text-bad font-semibold"> · atrasada</span> : null}
                          </>
                        ) : p.last ? (
                          <>
                            Encerrou <strong>{p.last.storeName}</strong> às {fmtTime(p.last.finishedAt)}
                          </>
                        ) : (
                          "Sem visita hoje"
                        )}
                      </p>
                      <p className="text-[11.5px] text-muted mt-0.5">
                        {p.completed}/{p.scheduled} loja(s) · {p.done.length} atendimento(s) hoje · {p.online ? "online" : p.lastSeenAt ? `visto ${fmtAgo(p.lastSeenAt)}` : "não abriu o app hoje"}
                      </p>
                      {p.done.length ? (
                        <button type="button" onClick={() => setOpen(expanded ? null : p.promoterId)} className="mt-1 text-[12px] font-semibold text-brand-700 inline-flex items-center gap-1">
                          {expanded ? "Esconder" : "Ver"} atendimentos feitos <ChevronDown className={clsx("size-3.5 transition-transform", expanded && "rotate-180")} />
                        </button>
                      ) : null}
                      {expanded ? (
                        <ul className="mt-1.5 space-y-1">
                          {p.done.map((d) => (
                            <li key={d.attendanceId} className="text-[12px] flex gap-1.5">
                              {d.status === "completed" ? <CheckCircle2 className="size-3.5 text-ok shrink-0 mt-px" /> : <CircleSlash className="size-3.5 text-bad shrink-0 mt-px" />}
                              <span>
                                <span className="tnum text-muted">{fmtTime(d.at)}</span> {d.brandName} · {d.storeName}
                                {d.status === "cancelled" ? <span className="text-bad"> (não atendida)</span> : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {data?.events.length ? (
        <section className="mt-4 bg-surface border border-line rounded-[var(--radius-card)]">
          <h2 className="px-4 pt-3 pb-2 text-[15px] font-semibold">Acontecendo hoje</h2>
          <ul className="px-4 pb-3 grid sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1.5 max-h-56 overflow-y-auto">
            {data.events.slice(0, 30).map((e) => {
              const Icon = EVENT_ICON[e.kind];
              return (
                <li key={e.id} className="text-[12.5px] flex gap-2 min-w-0">
                  <Icon className={clsx("size-4 shrink-0", EVENT_TONE[e.kind])} />
                  <span className="min-w-0">
                    <span className="tnum text-muted">{fmtTime(e.at)}</span> <strong>{e.promoterName}</strong> {e.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Avisos na tela (novidades desde que a página foi aberta). */}
      <div className="fixed z-[1000] flex flex-col gap-2 w-[min(360px,calc(100vw-32px))]" style={{ top: "calc(16px + env(safe-area-inset-top, 0px))", right: "calc(16px + env(safe-area-inset-right, 0px))" }} aria-live="polite">
        {toasts.map((e) => {
          const Icon = EVENT_ICON[e.kind];
          return (
            <div key={e.id} className="bg-surface border border-line shadow-lg rounded-xl px-3 py-2.5 flex gap-2.5 items-start">
              <Icon className={clsx("size-5 shrink-0 mt-0.5", EVENT_TONE[e.kind])} />
              <p className="text-[13px] flex-1 min-w-0">
                <strong>{e.promoterName}</strong> {e.text}
                <span className="block text-[11.5px] text-muted tnum">{fmtTime(e.at)}</span>
              </p>
              <button type="button" onClick={() => setToasts((t) => t.filter((x) => x.id !== e.id))} className="text-muted hover:text-ink" aria-label="Fechar aviso">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Count({ label, value, sub, tone }: { label: string; value: number | undefined; sub?: string; tone?: string }) {
  return (
    <div className="bg-surface border border-line rounded-[var(--radius-card)] px-4 py-3">
      <p className="text-[12px] text-muted leading-tight">{label}</p>
      <p className={clsx("text-[24px] font-bold tnum leading-tight mt-1", tone)}>{value ?? "—"}</p>
      {sub ? <p className="text-[11.5px] text-muted">{sub}</p> : null}
    </div>
  );
}
