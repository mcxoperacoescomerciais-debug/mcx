"use client";

import { useMemo, useState } from "react";
import { CalendarCheck2, MapPin, Search, Store } from "lucide-react";
import clsx from "clsx";
import { matchesQuery } from "@/lib/rules";
import { go, useCatalog, useLocal } from "../_lib/hooks";
import { BottomTabs, Chip, Screen, TopBar } from "./primitives";
import { useStartVisit } from "./visit-start";

/** Só lojas autorizadas ao promotor (o servidor manda apenas essas). */
export function StoresScreen() {
  const cat = useCatalog();
  const local = useLocal();
  const { startScheduled, startExtra, sheets } = useStartVisit();
  const [query, setQuery] = useState("");
  const [onlyToday, setOnlyToday] = useState(false);
  const todaySchedules = cat.schedules.filter((s) => s.date === cat.today);

  const list = useMemo(
    () =>
      cat.stores
        .filter((s) => !onlyToday || todaySchedules.some((x) => x.storeId === s.id))
        .filter((s) => matchesQuery(`${s.name} ${s.chainName ?? ""} ${s.city} ${s.code ?? ""} ${s.district ?? ""}`, query)),
    [cat.stores, onlyToday, todaySchedules, query],
  );

  return (
    <Screen>
      <TopBar title="Minhas lojas" subtitle={`${cat.stores.length} lojas autorizadas`} />
      <div className="sticky top-14 z-20 bg-canvas px-4 pt-3 pb-2 space-y-2">
        <label className="relative block">
          <Search className="size-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, rede ou cidade"
            className="w-full h-12 rounded-2xl border border-line-strong bg-surface pl-11 pr-4 text-[15px] focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
            type="search"
          />
        </label>
        <div className="flex gap-2">
          <Chip selected={!onlyToday} onClick={() => setOnlyToday(false)}>
            Todas
          </Chip>
          <Chip selected={onlyToday} onClick={() => setOnlyToday(true)}>
            Programadas hoje ({todaySchedules.length})
          </Chip>
        </div>
      </div>

      <div className="px-4 space-y-2.5 mt-1">
        {list.length === 0 ? (
          <div className="text-center py-12 text-muted">
            <Store className="size-8 mx-auto" />
            <p className="mt-2 font-semibold text-ink">Nenhuma loja encontrada</p>
            <p className="text-[14px]">Tente outro nome ou limpe a busca.</p>
          </div>
        ) : null}
        {list.map((store) => {
          const schedule = todaySchedules.find((s) => s.storeId === store.id);
          const visit = Object.values(local.visits).find((v) => v.storeId === store.id && v.visitDate === cat.today && v.status !== "cancelled");
          return (
            <article key={store.id} className="bg-surface border border-line rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[16px] leading-snug">{store.name}</h3>
                  <p className="text-[13px] text-muted mt-0.5 flex items-start gap-1">
                    <MapPin className="size-3.5 mt-0.5 shrink-0" />
                    {[store.chainName, store.address, store.district, `${store.city}/${store.state}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {schedule ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ok bg-ok-bg rounded-full px-2 py-1">
                    <CalendarCheck2 className="size-3.5" /> Hoje {schedule.plannedStart ?? ""}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {store.brandIds.map((b) => (
                  <span key={b} className={clsx("text-[12px] font-medium rounded-md px-2 py-0.5", schedule?.brandIds.includes(b) ? "bg-brand-50 text-brand-800" : "bg-canvas text-ink-2")}>
                    {cat.brandById.get(b)?.name}
                  </span>
                ))}
              </div>
              <div className="mt-3">
                {visit ? (
                  <button type="button" onClick={() => go(`visita/${visit.id}`)} className="w-full h-12 rounded-xl border border-line-strong font-semibold text-[15px] text-brand-800 active:bg-canvas">
                    {visit.status === "in_progress" ? "Continuar visita" : "Ver visita de hoje"}
                  </button>
                ) : schedule ? (
                  <button type="button" onClick={() => startScheduled(schedule)} className="w-full h-12 rounded-xl bg-brand-800 text-white font-semibold text-[15px] active:bg-brand-900">
                    INICIAR VISITA
                  </button>
                ) : cat.settings?.allowExtraVisits ? (
                  <button type="button" onClick={() => startExtra(store)} className="w-full h-12 rounded-xl border border-line-strong font-semibold text-[14px] text-ink-2 active:bg-canvas">
                    Registrar visita fora da programação
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {sheets}
      <BottomTabs active="lojas" />
    </Screen>
  );
}
