"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, History, Loader2, LogOut, RefreshCw, WifiOff } from "lucide-react";
import { Button, McxFooter, StatusBadge } from "@/components/ui";
import { ATTENDANCE_STATUS_LABEL, ATTENDANCE_STATUS_TONE, EMPLOYMENT_LABEL, VISIT_STATUS_LABEL, VISIT_STATUS_TONE, type AttendanceStatus, type Employment, type VisitStatus } from "@/lib/domain";
import { fmtAgo, fmtDate, fmtTime } from "@/lib/dates";
import { attendanceDisplayStatus, isVisitDirty, pendingCount, refreshAll, refreshHistory } from "../_lib/local-store";
import { go, useCatalog, useLocal } from "../_lib/hooks";
import type { PromoterHistoryItem } from "@/lib/sync-types";
import { BottomTabs, Notice, Screen, Sheet, toast, TopBar } from "./primitives";
import { ImprovementForm } from "@/components/improvement-form";
import { listMyImprovementsAction } from "@/app/_actions/improvements";
import { IMPROVEMENT_STATUS_LABEL, IMPROVEMENT_STATUS_TONE, type ImprovementStatus } from "@/lib/improvements";

export function HistoryScreen() {
  const local = useLocal();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void refreshHistory().finally(() => setLoading(false));
  }, []);
  const cat = useCatalog();
  // Visitas gravadas neste celular entram no histórico mesmo sem sinal (e antes de chegarem ao servidor).
  const history = useMemo<PromoterHistoryItem[] | null>(() => {
    const server = local.history ?? [];
    const known = new Set(server.map((h) => h.visitId));
    const mine: PromoterHistoryItem[] = Object.values(local.visits)
      .filter((v) => !known.has(v.id) || isVisitDirty(v))
      .map((v) => {
        const store = cat.storeById.get(v.storeId);
        return {
          visitId: v.id,
          visitDate: v.visitDate,
          storeName: store?.name ?? "Loja",
          chainName: null,
          city: store?.city ?? "",
          status: v.status,
          startedAt: v.startedAt,
          finishedAt: v.finishedAt,
          brands: Object.values(v.attendances).map((a) => ({
            attendanceId: a.id,
            brandName: cat.brandById.get(a.brandId)?.name ?? "Marca",
            status: attendanceDisplayStatus(a),
            ruptures: Object.keys(a.ruptures).length,
            correction: a.status === "correction_requested",
          })),
        };
      });
    if (!mine.length && local.history === null) return null;
    const ids = new Set(mine.map((m) => m.visitId));
    return [...mine, ...server.filter((h) => !ids.has(h.visitId))].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [local.history, local.visits, cat]);
  return (
    <Screen>
      <TopBar title="Meu histórico" subtitle="Últimos 45 dias" />
      <div className="px-4 pt-4 space-y-2.5">
        {!local.sync.online ? (
          <Notice tone="warn" icon={<WifiOff className="size-5" />}>
            {local.historyAt
              ? `Sem sinal: mostrando as visitas deste celular e o histórico salvo ${fmtAgo(local.historyAt)}.`
              : "Sem sinal: mostrando as visitas gravadas neste celular. O histórico completo aparece com internet."}
          </Notice>
        ) : null}
        {loading && !history ? (
          <div className="py-12 grid place-items-center text-muted">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : null}
        {history && history.length === 0 ? (
          <div className="py-12 text-center text-muted">
            <History className="size-8 mx-auto" />
            <p className="mt-2 font-semibold text-ink">Nenhuma visita registrada ainda</p>
          </div>
        ) : null}
        {history?.map((h) => {
          const hasLocal = Boolean(local.visits[h.visitId]);
          return (
            <button
              key={h.visitId}
              type="button"
              disabled={!hasLocal}
              onClick={() => go(`visita/${h.visitId}`)}
              className="w-full text-left bg-surface border border-line rounded-2xl p-4 disabled:cursor-default"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[15px] truncate">{h.storeName}</p>
                  <p className="text-[12.5px] text-muted tnum">
                    {fmtDate(h.visitDate)} · {fmtTime(h.startedAt)}–{fmtTime(h.finishedAt)} · {h.city}
                  </p>
                </div>
                <StatusBadge tone={VISIT_STATUS_TONE[h.status as VisitStatus]} size="sm">
                  {VISIT_STATUS_LABEL[h.status as VisitStatus]}
                </StatusBadge>
                {hasLocal ? <ChevronRight className="size-4 text-muted mt-0.5" /> : null}
              </div>
              <ul className="mt-2.5 space-y-1">
                {h.brands.map((b) => (
                  <li key={b.attendanceId} className="flex items-center justify-between text-[13.5px]">
                    <span>
                      {b.brandName}
                      {b.ruptures ? <span className="text-bad text-[12px] font-semibold"> · {b.ruptures} ruptura(s)</span> : null}
                    </span>
                    <StatusBadge tone={ATTENDANCE_STATUS_TONE[b.status as AttendanceStatus]} size="sm">
                      {ATTENDANCE_STATUS_LABEL[b.status as AttendanceStatus]}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
      <BottomTabs active="historico" />
    </Screen>
  );
}

/** /sair é um route handler (limpa o cookie): precisa de navegação completa. */
function leave() {
  // Fotos e logo guardados para uso sem sinal não ficam para o próximo usuário do aparelho.
  const clear = typeof caches !== "undefined" ? caches.delete("media-v1").catch(() => false) : Promise.resolve(false);
  void clear.finally(() => {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/sair";
  });
}

export function ProfileScreen() {
  const local = useLocal();
  const user = local.bootstrap!.user;
  const pending = pendingCount(local);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  return (
    <Screen>
      <TopBar title="Perfil" />
      <div className="px-4 pt-4 space-y-3">
        <section className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3">
          <span className="size-12 rounded-full bg-brand-800 text-white grid place-items-center text-[18px] font-bold">{user.name.slice(0, 1)}</span>
          <div>
            <p className="font-semibold text-[16px]">{user.name}</p>
            <p className="text-[13px] text-muted">
              Promotor{user.employment ? ` · ${EMPLOYMENT_LABEL[user.employment as Employment]}` : ""} · {local.bootstrap!.agency.name}
            </p>
          </div>
        </section>

        <section className="bg-surface border border-line rounded-2xl p-4">
          <h2 className="font-semibold text-[15px] mb-2">Sincronização</h2>
          <ul className="text-[14px] space-y-1.5">
            <li className="flex justify-between">
              <span className="text-muted">Conexão</span>
              <span className="font-semibold">{local.sync.online ? "Online" : "Sem sinal"}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">Itens aguardando envio</span>
              <span className={pending ? "font-semibold text-sync" : "font-semibold text-ok"}>{pending || "Nenhum"}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">Última sincronização</span>
              <span className="font-semibold">{local.sync.lastSyncAt ? fmtAgo(local.sync.lastSyncAt) : "—"}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">Roteiro atualizado</span>
              <span className="font-semibold">{local.bootstrapAt ? fmtAgo(local.bootstrapAt) : "—"}</span>
            </li>
          </ul>
          {local.sync.lastError ? <p className="text-[13px] text-bad mt-2">{local.sync.lastError}</p> : null}
          <Button
            variant="secondary"
            size="lg"
            className="w-full mt-3"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              await refreshAll();
              setSyncing(false);
              toast(pendingCount() ? "Ainda há itens aguardando sinal." : "Tudo sincronizado.");
            }}
          >
            {syncing ? <Loader2 className="size-5 animate-spin" /> : <RefreshCw className="size-5" />} Sincronizar agora
          </Button>
        </section>

        <ImprovementSection online={local.sync.online} />

        <Button variant="ghost" size="lg" className="w-full text-bad" onClick={() => (pending ? setLogoutOpen(true) : leave())}>
          <LogOut className="size-5" /> Sair
        </Button>
      </div>

      <McxFooter variant="dark" className="mt-8 mb-2" />
      <Sheet open={logoutOpen} onClose={() => setLogoutOpen(false)} title="Há registros não enviados">
        <Notice tone="bad" icon={<AlertTriangle className="size-5" />}>
          {pending} {pending === 1 ? "registro ainda está" : "registros ainda estão"} só neste celular. Conecte-se à internet e sincronize antes de sair.
        </Notice>
        <Button size="lg" className="w-full mt-4" onClick={() => setLogoutOpen(false)}>
          Ficar e sincronizar
        </Button>
      </Sheet>
      <BottomTabs active="perfil" />
    </Screen>
  );
}

type MyImprovement = { id: string; title: string; status: ImprovementStatus; reply: string | null; createdAt: string };

/** Sugestão de melhoria do promotor (precisa de internet) e as respostas da MCX. */
function ImprovementSection({ online }: { online: boolean }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<MyImprovement[] | null>(null);
  const load = () => {
    listMyImprovementsAction()
      .then(setMine)
      .catch(() => setMine(null));
  };
  useEffect(() => {
    if (open && online) load();
  }, [open, online]);
  return (
    <section className="bg-surface border border-line rounded-2xl p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between text-left" aria-expanded={open}>
        <span>
          <span className="block font-semibold text-[15px]">Sugerir melhoria</span>
          <span className="block text-[13px] text-muted">Algo no app poderia ser melhor? Conte para a MCX.</span>
        </span>
        <ChevronRight className={`size-5 text-muted transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open ? (
        <div className="mt-3 space-y-4">
          {online ? null : <Notice tone="bad" icon={<WifiOff className="size-5" />}>Sem sinal agora. A sugestão precisa de internet para ser enviada.</Notice>}
          <ImprovementForm origin="App do promotor" large onSent={load} />
          {mine?.length ? (
            <div>
              <h3 className="font-semibold text-[14px] mb-1.5">Suas sugestões</h3>
              <ul className="space-y-2">
                {mine.map((m) => (
                  <li key={m.id} className="rounded-xl border border-line p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-[14px]">{m.title}</p>
                      <StatusBadge tone={IMPROVEMENT_STATUS_TONE[m.status]} size="sm">{IMPROVEMENT_STATUS_LABEL[m.status]}</StatusBadge>
                    </div>
                    <p className="text-[12px] text-muted mt-0.5">{fmtAgo(m.createdAt)}</p>
                    {m.reply ? <p className="mt-2 text-[13.5px] bg-subtle rounded-lg px-3 py-2 whitespace-pre-line">MCX: {m.reply}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
