"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, History, KeyRound, Loader2, LogOut, RefreshCw, WifiOff } from "lucide-react";
import { Button, McxFooter, StatusBadge } from "@/components/ui";
import { ATTENDANCE_STATUS_LABEL, ATTENDANCE_STATUS_TONE, EMPLOYMENT_LABEL, VISIT_STATUS_LABEL, VISIT_STATUS_TONE, type AttendanceStatus, type Employment, type VisitStatus } from "@/lib/domain";
import { fmtAgo, fmtDate, fmtTime } from "@/lib/dates";
import { pendingCount, refreshAll, refreshHistory } from "../_lib/local-store";
import { go, useLocal } from "../_lib/hooks";
import { BottomTabs, Notice, Screen, Sheet, toast, TopBar } from "./primitives";

export function HistoryScreen() {
  const local = useLocal();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void refreshHistory().finally(() => setLoading(false));
  }, []);
  const history = local.history;
  return (
    <Screen>
      <TopBar title="Meu histórico" subtitle="Últimos 45 dias" />
      <div className="px-4 pt-4 space-y-2.5">
        {!local.sync.online ? (
          <Notice tone="warn" icon={<WifiOff className="size-5" />}>
            Sem sinal: mostrando o último histórico carregado.
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
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/sair";
}

export function ProfileScreen() {
  const local = useLocal();
  const user = local.bootstrap!.user;
  const pending = pendingCount(local);
  const [pwdOpen, setPwdOpen] = useState(false);
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

        <Button variant="secondary" size="lg" className="w-full" onClick={() => setPwdOpen(true)}>
          <KeyRound className="size-5" /> Trocar senha
        </Button>
        <Button variant="ghost" size="lg" className="w-full text-bad" onClick={() => (pending ? setLogoutOpen(true) : leave())}>
          <LogOut className="size-5" /> Sair
        </Button>
      </div>

      <McxFooter variant="dark" className="mt-8 mb-2" />
      <PasswordSheet open={pwdOpen} onClose={() => setPwdOpen(false)} />
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

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = "w-full h-12 rounded-xl border border-line-strong px-3.5 text-[15px] focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Trocar senha"
      footer={
        <Button
          size="xl"
          className="w-full"
          disabled={busy || next.length < 6 || !current}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = await fetch("/api/me/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, next }) }).catch(() => null);
            setBusy(false);
            if (!res) return setError("Sem conexão. Tente quando houver sinal.");
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) return setError(body.error ?? "Não foi possível trocar a senha.");
            toast("Senha alterada. Entre novamente.");
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- rota de API/route handler, exige navegação completa
            setTimeout(() => (window.location.href = "/sair"), 900);
          }}
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />} Salvar nova senha
        </Button>
      }
    >
      <label className="block">
        <span className="block text-[13px] font-semibold text-ink-2 mb-1.5">Senha atual</span>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} autoComplete="current-password" />
      </label>
      <label className="block mt-3">
        <span className="block text-[13px] font-semibold text-ink-2 mb-1.5">Nova senha (mínimo 6 caracteres)</span>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className={input} autoComplete="new-password" />
      </label>
      {error ? <p className="text-[13px] text-bad mt-3">{error}</p> : null}
    </Sheet>
  );
}
