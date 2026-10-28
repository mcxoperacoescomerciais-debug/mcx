"use client";

/**
 * Carteira com meta semanal (tela inicial do promotor que não segue roteiro):
 * quanto falta na semana, loja por loja e marca por marca, com o que está
 * mais atrasado no topo e comemoração quando a loja ou a semana fecham.
 */
import { CheckCircle2, MapPin, PartyPopper, PlayCircle, RotateCcw, Target, Trophy } from "lucide-react";
import clsx from "clsx";
import { Button, Progress } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { PERIOD_SHORT } from "@/lib/portfolio";
import { go, useCatalog, useLocal } from "../_lib/hooks";
import type { PortfolioProgress, PortfolioStore } from "../_lib/portfolio-progress";

export function PortfolioHeader({ p, onStart }: { p: PortfolioProgress; onStart: (st: PortfolioStore) => void }) {
  const local = useLocal();
  const cat = useCatalog();
  const t = p.totals;
  const pct = t.target ? Math.round((t.counted / t.target) * 100) : 0;
  const weekDone = t.target > 0 && t.counted >= t.target;
  const missingForPace = Math.max(0, t.expected - t.counted);
  const storesDone = p.stores.filter((s) => s.complete).length;
  const open = Object.values(local.visits).find((v) => v.status === "in_progress");
  const next = p.stores.find((s) => !s.complete);

  return (
    <>
      <div className={clsx("mt-5 rounded-2xl p-4", weekDone ? "bg-ok text-white" : "bg-white/10")}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] uppercase tracking-wide font-semibold opacity-85">
            Meta da semana · {fmtDate(p.weekStart).slice(0, 5)} a {fmtDate(p.weekEnd).slice(0, 5)}
          </p>
          {weekDone ? <Trophy className="size-5" /> : <Target className="size-5 opacity-80" />}
        </div>
        <p className="mt-2 leading-none">
          <span className="text-[34px] font-bold tnum">{t.counted}</span>
          <span className="text-[16px] opacity-85"> de {t.target} visitas</span>
          <span className="text-[16px] font-semibold float-right tnum mt-3">{pct}%</span>
        </p>
        <div className="mt-3 h-3 rounded-full bg-white/20 overflow-hidden">
          <div className={clsx("h-full rounded-full transition-all duration-700", weekDone ? "bg-white" : missingForPace ? "bg-warn" : "bg-[#7fe0a8]")} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <p className="mt-3 text-[14px] font-medium">
          {weekDone ? (
            <span className="inline-flex items-center gap-1.5">
              <PartyPopper className="size-5" /> Carteira da semana completa. Parabéns!
            </span>
          ) : missingForPace ? (
            `Faltam ${missingForPace} ${missingForPace === 1 ? "visita" : "visitas"} para ficar no ritmo da semana.`
          ) : (
            "Você está no ritmo. Continue assim! 💪"
          )}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <MiniStat label="Lojas completas" value={`${storesDone}/${p.stores.length}`} />
        <MiniStat label="Visitas feitas" value={String(t.done)} />
        <MiniStat label="Lojas atrasadas" value={String(p.stores.filter((s) => s.behind).length)} alert={p.stores.some((s) => s.behind)} />
      </div>

      <div className="mt-4">
        {open ? (
          <Button size="xl" className="w-full !bg-white !text-brand-900 !h-auto min-h-14 py-3 !whitespace-normal" onClick={() => go(`visita/${open.id}`)}>
            <PlayCircle className="size-6 shrink-0" />
                <span className="min-w-0 text-left leading-tight">
                  <span className="block">Continuar visita</span>
                  <span className="block text-[14px] font-medium opacity-80 break-words">{cat.storeById.get(open.storeId)?.name}</span>
                </span>
          </Button>
        ) : next ? (
          <Button size="xl" className="w-full !bg-white !text-brand-900 !h-auto min-h-14 py-3 !whitespace-normal" onClick={() => onStart(next)}>
            <PlayCircle className="size-6 shrink-0" />
                <span className="min-w-0 text-left leading-tight">
                  <span className="block">Ir para a próxima loja</span>
                  <span className="block text-[14px] font-medium opacity-80 break-words">{cat.storeById.get(next.storeId)?.name}</span>
                </span>
          </Button>
        ) : null}
      </div>
    </>
  );
}

function MiniStat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={clsx("rounded-2xl px-3 py-2.5", alert ? "bg-bad text-white" : "bg-white/10")}>
      <p className="text-[20px] font-semibold tnum leading-none">{value}</p>
      <p className={clsx("text-[11.5px] mt-1 leading-tight", alert ? "text-white/90" : "text-brand-200")}>{label}</p>
    </div>
  );
}

export function PortfolioList({ p, onStart }: { p: PortfolioProgress; onStart: (st: PortfolioStore) => void }) {
  const cat = useCatalog();
  const local = useLocal();
  if (!p.stores.length) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-6 text-center">
        <Target className="size-8 mx-auto text-muted" />
        <p className="font-semibold mt-2">Sua carteira ainda não tem metas</p>
        <p className="text-[14px] text-muted mt-1">O gestor define quantas visitas por semana cada marca precisa em cada loja.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {p.stores.map((st) => {
        const store = cat.storeById.get(st.storeId);
        const openHere = Object.values(local.visits).find((v) => v.storeId === st.storeId && v.status === "in_progress");
        const todayVisit = Object.values(local.visits).find((v) => v.storeId === st.storeId && v.visitDate === p.today && v.status !== "cancelled" && v.status !== "in_progress");
        return (
          <article key={st.storeId} className={clsx("bg-surface border rounded-2xl overflow-hidden", st.complete ? "border-ok/40 ring-2 ring-ok/15" : st.behind ? "border-bad/30" : "border-line")}>
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[16px] leading-snug">{store?.name ?? "Loja"}</h3>
                  <p className="text-[13px] text-muted mt-0.5 flex items-center gap-1">
                    <MapPin className="size-3.5 shrink-0" />
                    <span className="truncate">{[store?.chainName, store?.address, store?.city].filter(Boolean).join(" · ")}</span>
                  </p>
                </div>
                {st.complete ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-bold text-ok bg-ok-bg rounded-full px-2.5 py-1 shrink-0">
                    <CheckCircle2 className="size-4" /> Completa
                  </span>
                ) : st.behind ? (
                  <span className="text-[12px] font-bold text-bad bg-bad-bg rounded-full px-2.5 py-1 shrink-0">Atrasada</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Progress value={st.counted} total={st.perWeek} className="flex-1" tone={st.complete ? "success" : st.behind ? "warning" : "info"} />
                <span className="text-[12.5px] font-semibold tnum text-ink-2">
                  {st.counted}/{st.perWeek}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {st.rows.map((r) => (
                  <span
                    key={r.brandId}
                    className={clsx(
                      "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-semibold",
                      r.status === "done" ? "bg-ok-bg text-ok" : r.status === "behind" ? "bg-bad-bg text-bad" : "bg-canvas text-ink-2",
                    )}
                  >
                    {r.status === "done" ? <CheckCircle2 className="size-3.5" /> : null}
                    {cat.brandById.get(r.brandId)?.name ?? "Marca"}
                    <span className="tnum">
                      {Math.min(r.done, r.perWeek)}/{r.perWeek}
                      {r.period !== "week" ? ` ${PERIOD_SHORT[r.period]}` : ""}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <div className="border-t border-line">
              {openHere ? (
                <button type="button" onClick={() => go(`visita/${openHere.id}`)} className="w-full h-14 flex items-center justify-center gap-2 font-semibold text-[15px] text-brand-800 active:bg-canvas">
                  <RotateCcw className="size-5" /> CONTINUAR VISITA
                </button>
              ) : todayVisit ? (
                <button type="button" onClick={() => go(`visita/${todayVisit.id}`)} className="w-full h-14 flex items-center justify-center gap-2 font-semibold text-[14px] text-ink-2 active:bg-canvas">
                  Visitada hoje · ver registro
                </button>
              ) : st.complete ? (
                <p className="h-14 flex items-center justify-center gap-2 text-[14px] font-semibold text-ok">
                  <PartyPopper className="size-5" /> Meta desta loja cumprida na semana
                </p>
              ) : (
                <button type="button" onClick={() => onStart(st)} className="w-full h-14 flex items-center justify-center gap-2 font-semibold text-[15px] text-brand-800 active:bg-canvas">
                  <PlayCircle className="size-5" /> INICIAR VISITA
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** Marcas da visita: as que ainda faltam na semana (ou todas da meta, se já cumpridas). */
export function portfolioBrands(st: PortfolioStore): string[] {
  const missing = st.rows.filter((r) => r.done < r.perWeek).map((r) => r.brandId);
  return missing.length ? missing : st.rows.map((r) => r.brandId);
}
