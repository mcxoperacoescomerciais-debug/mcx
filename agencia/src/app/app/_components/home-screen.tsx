"use client";

import { useMemo } from "react";
import { AlertOctagon, ArrowRight, CalendarClock, ChevronRight, Clock, MapPin, PencilLine, PlayCircle, RotateCcw, Store } from "lucide-react";
import clsx from "clsx";
import { Button, McxFooter, Progress, StatusBadge, TradeWordmark } from "@/components/ui";
import { ATTENDANCE_STATUS_LABEL, ATTENDANCE_STATUS_TONE } from "@/lib/domain";
import { fmtLongDate, fmtTime } from "@/lib/dates";
import { pendingCount } from "../_lib/local-store";
import { go, useCatalog, useLocal } from "../_lib/hooks";
import { brandSlots, isDoneStatus, stopStatus, STOP_STATUS_LABEL, STOP_STATUS_TONE } from "../_lib/derive";
import { BottomTabs, Notice, RefreshButton, Screen, SectionTitle, SyncPill } from "./primitives";
import { useStartVisit } from "./visit-start";
import type { BootstrapSchedule } from "@/lib/sync-types";
import { usePortfolio } from "../_lib/portfolio-progress";
import { PortfolioHeader, PortfolioList, portfolioBrands } from "./portfolio";

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export function HomeScreen() {
  const local = useLocal();
  const cat = useCatalog();
  const { startScheduled, startPortfolio, sheets } = useStartVisit();
  const portfolio = usePortfolio();
  // Tela da carteira: quem trabalha por carteira, ou quem só tem atribuições sem dia fixo hoje.
  const startStore = (st: Parameters<typeof portfolioBrands>[0]) => startPortfolio(st.storeId, portfolioBrands(st));
  const user = local.bootstrap!.user;
  const today = cat.today;

  const stops = useMemo(() => {
    const visits = Object.values(local.visits);
    const scheduled = cat.schedules
      .filter((s) => s.date === today)
      .map((s) => {
        const visit = visits.find((v) => v.scheduleId === s.id && v.status !== "cancelled");
        return { schedule: s as BootstrapSchedule | null, storeId: s.storeId, visit, planned: s.brandIds };
      });
    const extras = visits
      .filter((v) => !v.scheduleId && v.visitDate === today && v.status !== "cancelled")
      .map((v) => ({ schedule: null, storeId: v.storeId, visit: v, planned: v.plannedBrandIds }));
    return [...scheduled, ...extras];
  }, [local.visits, cat.schedules, today]);

  const portfolioHome = portfolio && (local.bootstrap!.workMode === "portfolio" || !stops.length) ? portfolio : null;
  const tomorrow = cat.schedules.filter((s) => s.date > today);
  const corrections = Object.values(local.visits).flatMap((v) =>
    Object.values(v.attendances)
      .filter((a) => a.status === "correction_requested")
      .map((a) => ({ visit: v, attendance: a })),
  );
  const refused = Object.values(local.visits).flatMap((v) => [
    ...(v.serverError ? [{ visit: v, text: v.serverError, attendanceId: null as string | null }] : []),
    ...Object.values(v.attendances)
      .filter((a) => a.serverError && a.status !== "correction_requested")
      .map((a) => ({ visit: v, text: a.serverError!, attendanceId: a.id })),
  ]);

  const counts = useMemo(() => {
    let brandsPlanned = 0;
    let brandsDone = 0;
    let storesDone = 0;
    for (const st of stops) {
      const slots = brandSlots(st.visit, st.planned);
      brandsPlanned += slots.length;
      brandsDone += slots.filter((x) => isDoneStatus(x.status)).length;
      const ss = stopStatus(st.visit);
      if (ss === "completed" || ss === "closed_incomplete" || ss === "awaiting_sync") storesDone++;
    }
    return { brandsPlanned, brandsDone, storesDone, storesPending: stops.length - storesDone };
  }, [stops]);

  const open = stops.find((s) => s.visit?.status === "in_progress");
  const next = stops.find((s) => !s.visit && s.schedule);
  const pendencies = corrections.length + refused.length;
  const unsynced = pendingCount(local);

  return (
    <Screen>
      <header className="bg-brand-900 text-white">
        <div className="max-w-[560px] mx-auto px-4 pt-4 pb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {local.bootstrap!.agency.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={local.bootstrap!.agency.logoUrl} alt={local.bootstrap!.agency.name} className="size-9 rounded-full object-cover bg-white shrink-0" />
              ) : null}
              <div className="min-w-0">
                <TradeWordmark />
                <p className="text-[14px] font-semibold text-white truncate mt-1 leading-tight">{local.bootstrap!.agency.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <SyncPill />
              <RefreshButton />
            </div>
          </div>
          <h1 className="text-[24px] font-semibold mt-2 leading-tight">
            {greeting()}, {user.name.split(" ")[0]}
          </h1>
          {portfolioHome ? (
            <>
              <p className="text-[14px] text-brand-200 mt-0.5 first-letter:uppercase">{fmtLongDate(today)} · sua carteira da semana</p>
              <PortfolioHeader p={portfolioHome} onStart={startStore} />
            </>
          ) : (
          <>
          <p className="text-[14px] text-brand-200 mt-0.5">
            <span className="first-letter:uppercase inline-block">{fmtLongDate(today)}</span> · {stops.length ? `${stops.length} ${stops.length === 1 ? "loja programada" : "lojas programadas"}` : "sem programação"}
          </p>

          <div className="grid grid-cols-3 gap-2 mt-5">
            <Stat label="Lojas concluídas" value={`${counts.storesDone}/${stops.length}`} />
            <Stat label="Marcas atendidas" value={`${counts.brandsDone}/${counts.brandsPlanned}`} />
            <Stat label="Pendências" value={String(pendencies)} alert={pendencies > 0} />
          </div>

          <div className="mt-5">
            {open ? (
              <Button size="xl" className="w-full !bg-white !text-brand-900 !h-auto min-h-14 py-3 !whitespace-normal" onClick={() => go(`visita/${open.visit!.id}`)}>
                <PlayCircle className="size-6 shrink-0" />
                <span className="min-w-0 text-left leading-tight">
                  <span className="block">Continuar visita</span>
                  <span className="block text-[14px] font-medium opacity-80 break-words">{cat.storeById.get(open.storeId)?.name}</span>
                </span>
              </Button>
            ) : next ? (
              <Button size="xl" className="w-full !bg-white !text-brand-900" onClick={() => startScheduled(next.schedule!)}>
                <PlayCircle className="size-6" /> Iniciar próxima loja
              </Button>
            ) : stops.length ? (
              <p className="text-center text-[14px] text-brand-100 bg-white/10 rounded-2xl py-3.5">Todas as lojas de hoje foram iniciadas.</p>
            ) : (
              <Button size="xl" className="w-full !bg-white !text-brand-900" onClick={() => go("lojas")}>
                <Store className="size-6" /> Ver minhas lojas
              </Button>
            )}
          </div>
          </>
          )}
        </div>
      </header>

      <div className="px-4 space-y-3 mt-4">
        {unsynced > 0 && !local.sync.online ? (
          <Notice tone="warn" icon={<Clock className="size-5" />}>
            {unsynced} {unsynced === 1 ? "registro está" : "registros estão"} salvos só neste celular. Serão enviados quando houver sinal — não desinstale o app.
          </Notice>
        ) : null}
        {local.sync.lastError ? <Notice tone="bad" icon={<AlertOctagon className="size-5" />}>{local.sync.lastError}</Notice> : null}
      </div>

      {corrections.length ? (
        <>
          <SectionTitle>Correções solicitadas</SectionTitle>
          <div className="px-4 space-y-2">
            {corrections.map(({ visit, attendance }) => (
              <button
                key={attendance.id}
                type="button"
                onClick={() => go(`visita/${visit.id}/marca/${attendance.id}/revisao`)}
                className="w-full text-left bg-surface border border-bad/30 rounded-2xl p-4 flex gap-3 active:bg-canvas"
              >
                <PencilLine className="size-5 text-bad shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[15px]">
                    {cat.brandById.get(attendance.brandId)?.name} · {cat.storeById.get(visit.storeId)?.name}
                  </p>
                  <p className="text-[13px] text-ink-2 mt-0.5">“{attendance.correction?.reason}”</p>
                </div>
                <ChevronRight className="size-5 text-muted self-center" />
              </button>
            ))}
          </div>
        </>
      ) : null}

      {refused.length ? (
        <>
          <SectionTitle>Precisa da sua atenção</SectionTitle>
          <div className="px-4 space-y-2">
            {refused.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(r.attendanceId ? `visita/${r.visit.id}/marca/${r.attendanceId}/revisao` : `visita/${r.visit.id}`)}
                className="w-full text-left bg-bad-bg text-bad rounded-2xl p-4 flex gap-3"
              >
                <AlertOctagon className="size-5 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 text-[14px]">
                  <p className="font-semibold">{cat.storeById.get(r.visit.storeId)?.name}</p>
                  <p className="mt-0.5">{r.text}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {portfolioHome ? (
        <>
          <SectionTitle>Minha carteira da semana</SectionTitle>
          <div className="px-4">
            <PortfolioList p={portfolioHome} onStart={startStore} />
          </div>
        </>
      ) : (
      <>
      <SectionTitle>Roteiro de hoje</SectionTitle>
      <div className="px-4 space-y-3">
        {stops.length === 0 ? (
          <div className="bg-surface border border-line rounded-2xl p-6 text-center">
            <CalendarClock className="size-8 mx-auto text-muted" />
            <p className="font-semibold mt-2">Nenhuma loja programada para hoje</p>
            <p className="text-[14px] text-muted mt-1">Se o gestor acabou de programar, toque em Atualizar no topo. Visita fora do roteiro: abra pela aba Lojas.</p>
          </div>
        ) : (
          stops.map((st, i) => <StopCard key={st.schedule?.id ?? st.visit?.id ?? i} stop={st} index={i} onStart={() => st.schedule && startScheduled(st.schedule)} />)
        )}
      </div>

      {tomorrow.length ? (
        <>
          <SectionTitle>Amanhã</SectionTitle>
          <div className="px-4">
            <div className="bg-surface border border-line rounded-2xl divide-y divide-line">
              {tomorrow.map((s) => (
                <div key={s.id} className="px-4 py-3 flex items-center gap-3 text-[14px]">
                  <span className="tnum text-muted w-12">{s.plannedStart ?? "—"}</span>
                  <span className="flex-1 truncate font-medium">{cat.storeById.get(s.storeId)?.name}</span>
                  <span className="text-muted">{s.brandIds.length} marcas</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
      {portfolio ? (
        <>
          <SectionTitle>Carteira (sem dia fixo)</SectionTitle>
          <div className="px-4">
            <PortfolioList p={portfolio} onStart={startStore} />
          </div>
        </>
      ) : null}
      </>
      )}

      <McxFooter variant="dark" className="mt-8 mb-2" />
      {sheets}
      <BottomTabs active="hoje" />
    </Screen>
  );
}

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={clsx("rounded-2xl px-3 py-2.5", alert ? "bg-bad text-white" : "bg-white/10")}>
      <p className="text-[20px] font-semibold tnum leading-none">{value}</p>
      <p className={clsx("text-[11.5px] mt-1 leading-tight", alert ? "text-white/90" : "text-brand-200")}>{label}</p>
    </div>
  );
}

function StopCard({ stop, index, onStart }: { stop: { schedule: BootstrapSchedule | null; storeId: string; visit: ReturnType<typeof useLocal>["visits"][string] | undefined; planned: string[] }; index: number; onStart: () => void }) {
  const cat = useCatalog();
  const store = cat.storeById.get(stop.storeId);
  const slots = brandSlots(stop.visit, stop.planned);
  const done = slots.filter((x) => isDoneStatus(x.status)).length;
  const status = stopStatus(stop.visit);
  return (
    <article className={clsx("bg-surface border rounded-2xl overflow-hidden", status === "in_progress" ? "border-info/40 ring-2 ring-info/15" : "border-line")}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="size-8 shrink-0 rounded-full bg-brand-50 text-brand-800 grid place-items-center text-[13px] font-bold tnum">{index + 1}</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[16px] leading-snug">{store?.name ?? "Loja"}</h3>
            <p className="text-[13px] text-muted mt-0.5 flex items-center gap-1">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">
                {[store?.chainName, store?.address, store?.city].filter(Boolean).join(" · ")}
              </span>
            </p>
          </div>
          {stop.schedule?.plannedStart ? <span className="text-[13px] font-semibold tnum text-ink-2 bg-canvas rounded-lg px-2 py-1">{stop.schedule.plannedStart}</span> : null}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <StatusBadge tone={STOP_STATUS_TONE[status]} size="sm">
            {STOP_STATUS_LABEL[status]}
          </StatusBadge>
          {!stop.schedule ? <StatusBadge tone="muted" size="sm" icon={false}>Extraordinária</StatusBadge> : null}
          <span className="text-[12px] text-muted ml-auto tnum">
            {done}/{slots.length} marcas
          </span>
        </div>
        <Progress value={done} total={slots.length} className="mt-2" tone={status === "in_progress" ? "info" : "success"} />
        <ul className="mt-3 space-y-1.5">
          {slots.map((sl) => (
            <li key={sl.brandId} className="flex items-center justify-between gap-2 text-[14px]">
              <span className="truncate">{cat.brandById.get(sl.brandId)?.name ?? "Marca"}</span>
              <StatusBadge tone={ATTENDANCE_STATUS_TONE[sl.status]} size="sm">
                {ATTENDANCE_STATUS_LABEL[sl.status]}
              </StatusBadge>
            </li>
          ))}
        </ul>
        {stop.visit?.status === "in_progress" ? <p className="text-[12px] text-muted mt-3">Iniciada às {fmtTime(stop.visit.startedAt)}</p> : null}
      </div>
      <div className="border-t border-line">
        {!stop.visit ? (
          <button type="button" onClick={onStart} className="w-full h-14 flex items-center justify-center gap-2 font-semibold text-[15px] text-brand-800 active:bg-canvas">
            <PlayCircle className="size-5" /> INICIAR VISITA
          </button>
        ) : (
          <button type="button" onClick={() => go(`visita/${stop.visit!.id}`)} className="w-full h-14 flex items-center justify-center gap-2 font-semibold text-[15px] text-brand-800 active:bg-canvas">
            {stop.visit.status === "in_progress" ? (
              <>
                <RotateCcw className="size-5" /> CONTINUAR VISITA
              </>
            ) : (
              <>
                Ver registro <ArrowRight className="size-4" />
              </>
            )}
          </button>
        )}
      </div>
    </article>
  );
}
