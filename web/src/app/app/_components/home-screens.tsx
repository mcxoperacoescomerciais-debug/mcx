"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, History, Home, LogOut, MapPin, Play, RefreshCw, Search, Store, User, WifiOff } from "lucide-react";
import clsx from "clsx";
import { SyncPill, TopBar } from "./primitives";
import { go, needsFormatChoice, useCatalog, useLocal } from "../_lib/hooks";
import { chooseStoreFormat, isVisitFullySynced, pendingCount, refreshHistory, startVisit, syncNow, type LocalVisit } from "../_lib/local-store";
import { FormatSheet } from "./format-sheet";
import { STORE_FORMAT_LABEL, type StoreFormat } from "@/lib/domain";
import { normalize } from "@/lib/product-search";
import { daysBetween, formatIsoBr, todayIso } from "@/lib/validity";
import type { BootstrapStore } from "@/lib/sync-types";
import { changePasswordAction, logoutAction } from "../actions";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function sinceLabel(lastVisitDate: string | null) {
  if (!lastVisitDate) return "nunca visitada";
  const d = daysBetween(lastVisitDate, todayIso());
  if (d <= 0) return "visitada hoje";
  if (d === 1) return "visitada ontem";
  return `há ${d} dias sem visita`;
}

export function TabBar({ active }: { active: "inicio" | "lojas" | "historico" | "perfil" }) {
  const tabs = [
    { key: "inicio", label: "Início", icon: Home, href: "" },
    { key: "lojas", label: "Lojas", icon: Store, href: "lojas" },
    { key: "historico", label: "Histórico", icon: History, href: "historico" },
    { key: "perfil", label: "Perfil", icon: User, href: "perfil" },
  ] as const;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-line pb-safe">
      <div className="max-w-xl mx-auto grid grid-cols-4">
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = active === t.key;
          return (
            <button key={t.key} type="button" onClick={() => go(t.href, true)} className={clsx("h-16 flex flex-col items-center justify-center gap-1", on ? "text-navy-900" : "text-muted")}>
              <Icon className="size-[22px]" strokeWidth={on ? 2.4 : 1.9} />
              <span className={clsx("text-[11px]", on ? "font-bold" : "font-medium")}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Mostra quando o aparelho já guardou o app e as lojas/produtos: a partir daí
 * toda a visita (inclusive fotos) é preenchida sem internet; a internet só é
 * usada para enviar e gerar o PDF.
 */
function OfflineReady() {
  const { bootstrap } = useLocal();
  const [swReady, setSwReady] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistration().then((r) => setSwReady(Boolean(r?.active)));
  }, []);
  if (!bootstrap) return null;
  return (
    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 h-6 text-[11.5px] font-semibold text-[#7BE0A3]">
      <WifiOff className="size-3.5" />
      {swReady ? "Pronto para preencher sem internet" : "Preparando uso sem internet…"}
    </p>
  );
}

async function begin(storeId: string) {
  const id = await startVisit(storeId);
  go(`visita/${id}`);
}

function OngoingVisits({ visits, storeById }: { visits: LocalVisit[]; storeById: Map<string, BootstrapStore> }) {
  if (!visits.length) return null;
  return (
    <section className="space-y-2">
      {visits.map((v) => {
        const st = storeById.get(v.storeId);
        const n = Object.keys(v.occurrences).length;
        return (
          <button key={v.id} type="button" onClick={() => go(`visita/${v.id}`)} className="w-full text-left rounded-2xl bg-gold-100 border border-gold-400/50 p-4 flex items-center gap-3 active:brightness-95">
            <span className="size-11 rounded-full bg-gold-500 text-navy-950 grid place-items-center">
              <Play className="size-5 ml-0.5" fill="currentColor" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] font-bold uppercase tracking-wide text-gold-600">Visita em andamento</span>
              <span className="block text-[16px] font-semibold text-ink truncate">
                {st?.name}
                {st?.code ? ` · ${st.code}` : ""}
              </span>
              <span className="block text-[13px] text-ink-2">
                {n} {n === 1 ? "item registrado" : "itens registrados"} · toque para continuar
              </span>
            </span>
            <ChevronRight className="size-5 text-gold-600" />
          </button>
        );
      })}
    </section>
  );
}

function StoreRow({ store, ongoing }: { store: BootstrapStore; ongoing?: LocalVisit }) {
  const stale = !store.lastVisitDate || daysBetween(store.lastVisitDate, todayIso()) > 7;
  const [choosing, setChoosing] = useState(false);
  const multiFormat = (store.formatOptions?.length ?? 0) > 1;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <FormatSheet
        store={choosing ? store : null}
        onClose={() => setChoosing(false)}
        onChoose={(f) => {
          setChoosing(false);
          void chooseStoreFormat(store.id, f).then(() => (ongoing ? undefined : begin(store.id)));
        }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-ink truncate">
          {store.name}
          {store.code ? <span className="text-muted font-medium"> · Loja {store.code}</span> : null}
        </p>
        <p className="text-[13px] text-muted flex items-center gap-1">
          <MapPin className="size-3.5" /> {store.city} · {store.network}
          {multiFormat && store.format ? ` ${STORE_FORMAT_LABEL[store.format as StoreFormat] ?? store.format}` : ""}
        </p>
        <p className={clsx("text-[12px] font-semibold mt-0.5", stale ? "text-[#9A4A00]" : "text-[#1D6B3A]")}>{sinceLabel(store.lastVisitDate)}</p>
      </div>
      <button
        type="button"
        onClick={() => (ongoing ? go(`visita/${ongoing.id}`) : needsFormatChoice(store) ? setChoosing(true) : void begin(store.id))}
        className={clsx("h-11 px-4 rounded-xl font-semibold text-[14px] shrink-0", ongoing ? "bg-gold-500 text-navy-950" : "bg-navy-900 text-white active:bg-navy-950")}
      >
        {ongoing ? "Continuar" : "Iniciar visita"}
      </button>
    </li>
  );
}

export function HomeScreen() {
  const state = useLocal();
  const { stores, storeById } = useCatalog();
  const ongoing = Object.values(state.visits).filter((v) => v.status === "in_progress");
  const today = todayIso();
  const doneToday = Object.values(state.visits).filter((v) => v.status === "finished" && v.visitDate === today).length;
  const pending = pendingCount(state);
  const toVisit = [...stores]
    .filter((s) => !ongoing.some((v) => v.storeId === s.id))
    .sort((a, b) => (a.lastVisitDate ?? "").localeCompare(b.lastVisitDate ?? ""));
  const firstName = state.bootstrap?.user.name.split(" ")[0] ?? "";

  return (
    <div className="min-h-dvh pb-24">
      <header className="bg-navy-900 text-white pt-[env(safe-area-inset-top)]">
        <div className="max-w-xl mx-auto px-5 pt-5 pb-14">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mcx_logo.png" alt="" className="size-8 rounded-md" />
              <span className="text-[12px] font-semibold tracking-[0.2em] text-gold-400">SUINCO</span>
            </div>
            <SyncPill />
          </div>
          <h1 className="text-[24px] font-semibold mt-5">
            {greeting()}, {firstName}
          </h1>
          <p className="text-silver-300 text-[14px] first-letter:uppercase">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <OfflineReady />
        </div>
      </header>
      <div className="max-w-xl mx-auto px-4 -mt-9 space-y-5">
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-surface border border-line shadow-[var(--shadow-card)] p-3 text-center">
          <div>
            <p className="text-[22px] font-bold tnum">{doneToday}</p>
            <p className="text-[11px] text-muted font-semibold">Visitas hoje</p>
          </div>
          <div className="border-x border-line">
            <p className="text-[22px] font-bold tnum">{stores.length}</p>
            <p className="text-[11px] text-muted font-semibold">Minhas lojas</p>
          </div>
          <div>
            <p className={clsx("text-[22px] font-bold tnum", pending && "text-[#F07C1B]")}>{pending}</p>
            <p className="text-[11px] text-muted font-semibold">Pendentes</p>
          </div>
        </div>

        <OngoingVisits visits={ongoing} storeById={storeById} />

        <section>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Minhas lojas</h2>
            <button type="button" onClick={() => go("lojas")} className="text-[13px] font-semibold text-navy-700">
              Buscar
            </button>
          </div>
          {toVisit.length ? (
            <ul className="rounded-2xl bg-surface border border-line divide-y divide-line">
              {toVisit.map((s) => (
                <StoreRow key={s.id} store={s} />
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-muted">Nenhuma loja atribuída. Fale com o seu gestor.</p>
          )}
        </section>
      </div>
      <TabBar active="inicio" />
    </div>
  );
}

export function StoresScreen() {
  const state = useLocal();
  const { stores } = useCatalog();
  const [q, setQ] = useState("");
  const ongoing = Object.values(state.visits).filter((v) => v.status === "in_progress");
  const filtered = useMemo(() => {
    const n = normalize(q);
    return stores.filter((s) => !n || normalize(`${s.name} ${s.code ?? ""} ${s.city} ${s.network}`).includes(n));
  }, [stores, q]);
  return (
    <div className="min-h-dvh pb-24">
      <TopBar title="Minhas lojas" subtitle={`${stores.length} lojas atribuídas`} />
      <div className="max-w-xl mx-auto px-4 pt-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por loja, número ou cidade"
            className="w-full h-12 rounded-xl border border-line-strong pl-11 pr-4 text-[16px] bg-surface focus:border-navy-700 focus:outline-none focus:ring-4 focus:ring-navy-100"
          />
        </div>
        <ul className="rounded-2xl bg-surface border border-line divide-y divide-line">
          {filtered.map((s) => (
            <StoreRow key={s.id} store={s} ongoing={ongoing.find((v) => v.storeId === s.id)} />
          ))}
          {!filtered.length ? <li className="px-4 py-6 text-center text-muted text-[14px]">Nenhuma loja encontrada.</li> : null}
        </ul>
      </div>
      <TabBar active="lojas" />
    </div>
  );
}

export function HistoryScreen() {
  const state = useLocal();
  const { storeById } = useCatalog();
  useEffect(() => {
    void refreshHistory();
  }, []);
  const localPending = Object.values(state.visits).filter((v) => !isVisitFullySynced(v) || v.status === "in_progress");
  const history = state.history;

  return (
    <div className="min-h-dvh pb-24">
      <TopBar title="Histórico" subtitle="Suas visitas dos últimos 60 dias" />
      <div className="max-w-xl mx-auto px-4 pt-4 space-y-5">
        {localPending.length ? (
          <section>
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-2">Neste aparelho</h2>
            <ul className="rounded-2xl bg-surface border border-line divide-y divide-line">
              {localPending.map((v) => {
                const st = storeById.get(v.storeId);
                return (
                  <li key={v.id}>
                    <button type="button" onClick={() => go(v.status === "finished" ? `visita/${v.id}/ok` : `visita/${v.id}`)} className="w-full text-left px-4 py-3 flex items-center justify-between gap-3">
                      <span>
                        <span className="block text-[15px] font-semibold">{st?.name}</span>
                        <span className="block text-[13px] text-muted">
                          {formatIsoBr(v.visitDate)} · {v.status === "in_progress" ? "em andamento" : "aguardando envio"}
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
          {history === null ? (
            <p className="text-center text-muted py-8 text-[14px]">{state.sync.online ? "Carregando…" : "Sem sinal: o histórico aparece quando houver conexão."}</p>
          ) : history.length ? (
            <ul className="rounded-2xl bg-surface border border-line divide-y divide-line">
              {history.map((h) => (
                <li key={h.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold truncate">
                      {h.storeName}
                      {h.storeCode ? <span className="text-muted font-medium"> · {h.storeCode}</span> : null}
                    </p>
                    <p className="text-[13px] text-muted">
                      {formatIsoBr(h.visitDate)} · {h.city}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11px] font-semibold">
                      <span className="px-2 py-0.5 rounded-full bg-navy-50 text-ink-2">{h.validity + h.stock} validades</span>
                      {h.rupture ? <span className="px-2 py-0.5 rounded-full bg-[#FDECEC] text-[#B42318]">{h.rupture} rupturas</span> : null}
                      {h.damage ? <span className="px-2 py-0.5 rounded-full bg-[#FFF1E5] text-[#9A4A00]">{h.damage} avarias</span> : null}
                      {h.expired ? <span className="px-2 py-0.5 rounded-full bg-[#FDE8E8] text-[#8E1B1B]">{h.expired} vencidos</span> : null}
                    </div>
                  </div>
                  <a href={`/api/visits/${h.id}/pdf?inline=1`} target="_blank" rel="noreferrer" className="h-11 px-3 rounded-xl border border-line-strong inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2" aria-label="Abrir PDF">
                    <FileText className="size-4" /> PDF
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-muted py-8 text-[14px]">Nenhuma visita nos últimos 60 dias.</p>
          )}
        </section>
      </div>
      <TabBar active="historico" />
    </div>
  );
}

export function ProfileScreen() {
  const state = useLocal();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = pendingCount(state);
  return (
    <div className="min-h-dvh pb-24">
      <TopBar title="Meu perfil" />
      <div className="max-w-xl mx-auto px-4 pt-4 space-y-5">
        <div className="rounded-2xl bg-surface border border-line p-4 flex items-center gap-3">
          <span className="size-12 rounded-full bg-navy-900 text-gold-400 grid place-items-center text-[18px] font-bold">
            {state.bootstrap?.user.name.slice(0, 1)}
          </span>
          <div>
            <p className="text-[16px] font-semibold">{state.bootstrap?.user.name}</p>
            <p className="text-[13px] text-muted">
              @{state.bootstrap?.user.username} · Promotor {state.bootstrap?.client.name}
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-surface border border-line p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold">Sincronização</span>
            <SyncPill dark={false} />
          </div>
          <p className="text-[13px] text-muted">
            {state.sync.lastSyncAt ? `Último envio: ${new Date(state.sync.lastSyncAt).toLocaleString("pt-BR")}` : "Nenhum envio nesta sessão."}
            {state.sync.lastError ? <span className="block text-[#B42318]">{state.sync.lastError}</span> : null}
          </p>
          <button type="button" onClick={() => void syncNow()} className="h-11 px-4 rounded-xl border border-line-strong text-[14px] font-semibold inline-flex items-center gap-2">
            <RefreshCw className="size-4" /> Enviar agora
          </button>
        </div>

        <form
          className="rounded-2xl bg-surface border border-line p-4 space-y-3"
          action={async (fd) => {
            setBusy(true);
            const r = await changePasswordAction(fd);
            setMsg(r.ok ? { ok: true, text: "Senha alterada." } : { ok: false, text: r.error });
            setBusy(false);
          }}
        >
          <p className="text-[15px] font-semibold">Trocar senha</p>
          <input name="current" type="password" autoComplete="current-password" placeholder="Senha atual" required className="w-full h-12 rounded-xl border border-line-strong px-4 text-[16px]" />
          <input name="next" type="password" autoComplete="new-password" placeholder="Nova senha (mín. 6 caracteres)" minLength={6} required className="w-full h-12 rounded-xl border border-line-strong px-4 text-[16px]" />
          {msg ? <p className={clsx("text-[13px] font-semibold", msg.ok ? "text-[#1D6B3A]" : "text-[#B42318]")}>{msg.text}</p> : null}
          <button disabled={busy} className="h-11 px-4 rounded-xl bg-navy-900 text-white text-[14px] font-semibold">
            Salvar nova senha
          </button>
        </form>

        <form
          action={logoutAction}
          onSubmit={(e) => {
            if (pending && !confirm(`Há ${pending} registro(s) ainda não enviados. Se sair agora eles continuam salvos neste aparelho. Sair mesmo assim?`)) e.preventDefault();
          }}
        >
          <button className="w-full h-12 rounded-xl border border-line-strong text-[15px] font-semibold text-[#B42318] inline-flex items-center justify-center gap-2">
            <LogOut className="size-4" /> Sair
          </button>
        </form>
        <p className="text-center text-[11px] text-muted">SUINCO Gestão de Loja · AF Merchandising · MCX</p>
      </div>
      <TabBar active="perfil" />
    </div>
  );
}
