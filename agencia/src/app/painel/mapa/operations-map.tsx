"use client";

/**
 * Mapa das lojas (Leaflet + OpenStreetMap), marcadores agrupados quando
 * próximos. A cor é a situação da loja no dia. A localização registrada pelo
 * promotor é um ponto separado (losango), com o horário do registro — nunca
 * apresentada como posição atual.
 */
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { ATTENDANCE_STATUS_LABEL, STOP_BUCKET_LABEL, type AttendanceDisplayStatus } from "@/lib/domain";
import { fmtTime } from "@/lib/dates";
import type { LivePromoter, MapStatus, MapStore } from "@/server/map";

export const MAP_STATUS_COLOR: Record<MapStatus, string> = {
  completed: "#1f7a4d",
  exception: "#ffd60a", // concluída com exceção: amarelo vibrante
  in_progress: "#1d5ea6",
  late: "#ff8c00",
  missed: "#ff1a1a", // não realizada: vermelho vibrante
  pending: "#000000", // pendente: preto
  unscheduled: "#ffffff",
};
export const MAP_STATUS_LABEL: Record<MapStatus, string> = { ...STOP_BUCKET_LABEL, unscheduled: "Sem programação no dia" };

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function popupHtml(st: MapStore): string {
  const stops = st.stops
    .map((x) => {
      const brands = x.brands
        .map((b) => `<li>${esc(b.name)} — <b>${esc(b.status ? ATTENDANCE_STATUS_LABEL[b.status as AttendanceDisplayStatus] ?? b.status : "Não iniciada")}</b>${b.finishedAt ? ` às ${fmtTime(b.finishedAt)}` : ""}</li>`)
        .join("");
      const dist = x.registered?.distanceM != null ? (x.registered.distanceM >= 1000 ? `${(x.registered.distanceM / 1000).toFixed(1)} km` : `${x.registered.distanceM} m`) : null;
      const presence =
        x.presence === "far"
          ? `<div style="margin-top:4px;color:#b42318;font-weight:700">⚠ Check-in fora da loja: a ${dist} do endereço</div>`
          : x.presence === "inside"
            ? `<div style="margin-top:4px;color:#1f7a4d;font-weight:600">✓ Check-in na loja (${dist} do endereço)</div>`
            : x.presence === "no_location"
              ? `<div style="margin-top:4px;color:#b54708;font-weight:600">Check-in sem localização</div>`
              : "";
      const where = x.registered
        ? `Localização registrada pelo promotor às ${fmtTime(x.registered.at)}${x.registered.accuracyM ? ` (precisão ${Math.round(x.registered.accuracyM)} m)` : ""}`
        : x.visit
          ? x.geoStatus === "denied"
            ? "Promotor não autorizou a localização"
            : "Sem localização registrada"
          : "";
      return `<div style="border-top:1px solid #e5e7eb;padding-top:6px;margin-top:6px">
        <div><b>${esc(x.promoterName)}</b>${x.extra ? " · visita extraordinária" : ""}</div>
        <div style="color:#555">Previsto ${esc(x.plannedStart ?? "—")} · Início ${x.visit ? fmtTime(x.visit.startedAt) : "—"} · Fim ${x.visit?.finishedAt ? fmtTime(x.visit.finishedAt) : "—"}</div>
        <div style="margin-top:2px"><span style="font-weight:600">${esc(STOP_BUCKET_LABEL[x.bucket])}</span></div>
        ${presence}
        <ul style="margin:4px 0 0 16px;padding:0">${brands || "<li>Sem marcas previstas</li>"}</ul>
        ${where ? `<div style="color:#555;margin-top:4px;font-size:11.5px">${esc(where)}</div>` : ""}
        ${x.visit ? `<a href="/painel/visitas/${esc(x.visit.id)}" target="_blank" style="display:inline-block;margin-top:4px;font-weight:600">Abrir visita →</a>` : ""}
      </div>`;
    })
    .join("");
  return `<div style="font:13px/1.4 Inter,system-ui,sans-serif;min-width:230px;max-width:300px">
    <div style="font-weight:700;font-size:14px">${esc(st.name)}</div>
    <div style="color:#555">${esc([st.chain, st.address, st.city].filter(Boolean).join(" · "))}</div>
    ${st.approximate ? `<div style="color:#b54708;font-size:11.5px;margin-top:2px">Loja sem endereço no mapa: posição aproximada pelo check-in</div>` : ""}
    <div style="margin-top:4px"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${MAP_STATUS_COLOR[st.status]};border:1.5px solid #0c323a;margin-right:5px"></span>${esc(MAP_STATUS_LABEL[st.status])}</div>
    ${stops}
    <a href="/painel/lojas/${esc(st.id)}" target="_blank" style="display:inline-block;margin-top:6px;color:#555">Histórico da loja</a>
  </div>`;
}

const initials = (name: string) =>
  name
    .split(/s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/**
 * Camada ao vivo: promotor dentro da loja (visita aberta) = selo cheio na loja;
 * quem ainda vai para a próxima loja = selo vazado na próxima loja do roteiro.
 */
function liveIcon(L: typeof import("leaflet"), p: LivePromoter, here: boolean) {
  const ring = here ? "#1d5ea6" : "#64748b";
  const dot = p.online ? "#16a34a" : "#9ca3af";
  return L.divIcon({
    className: "",
    html: `<span style="position:relative;display:grid;place-items:center;width:30px;height:30px;border-radius:50%;font:700 11px/1 Inter,system-ui,sans-serif;${here ? `background:${ring};color:#fff` : `background:#fff;color:${ring};border:2px dashed ${ring}`};box-shadow:0 1px 4px rgba(0,0,0,.35)${here && p.online ? ";animation:mcxPulse 1.8s ease-out infinite" : ""}">${esc(initials(p.name))}<span style="position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;border-radius:50%;background:${dot};border:2px solid #fff"></span></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export function OperationsMap({ stores, live, focus }: { stores: MapStore[]; live?: LivePromoter[]; focus?: { lat: number; lng: number; key: number } | null }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ L: typeof import("leaflet"); map: import("leaflet").Map } | null>(null);
  const [ready, setReady] = useState(0);
  // A loja já aparece onde o promotor estava ao entrar: o losango de registro fica desligado.
  const [showRegistered, setShowRegistered] = useState(false);
  const hasRegistered = false;

  useEffect(() => {
    let disposed = false;
    let map: import("leaflet").Map | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      (window as unknown as { L: typeof L }).L = L;
      await import("leaflet.markercluster");
      if (disposed || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      const cluster = L.markerClusterGroup({ maxClusterRadius: 40, showCoverageOnHover: false });
      const bounds: [number, number][] = [];
      for (const st of stores) {
        if (st.lat == null || st.lng == null) continue;
        const color = MAP_STATUS_COLOR[st.status];
        const far = st.stops.some((x) => x.presence === "far");
        const icon = L.divIcon({
          className: "",
          html: `<span style="display:block;width:18px;height:18px;border-radius:50%;background:${color};border:3px ${st.approximate ? "dashed" : "solid"} ${far ? "#ff1a1a" : st.status === "pending" ? "#ffffff" : "#0c323a"};box-shadow:${far ? "0 0 0 3px rgba(255,26,26,.35)" : "0 1px 3px rgba(0,0,0,.35)"}"></span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        cluster.addLayer(L.marker([st.lat, st.lng], { icon, title: st.name }).bindPopup(popupHtml(st)));
        bounds.push([st.lat, st.lng]);
      }
      map.addLayer(cluster);
      if (showRegistered) {
        for (const st of stores) {
          for (const x of st.stops) {
            if (!x.registered) continue;
            const icon = L.divIcon({
              className: "",
              html: `<span style="display:block;width:12px;height:12px;transform:rotate(45deg);background:#fff;border:2.5px solid #6b21a8"></span>`,
              iconSize: [12, 12],
              iconAnchor: [6, 6],
            });
            L.marker([x.registered.lat, x.registered.lng], { icon, zIndexOffset: -100 })
              .bindTooltip(`${esc(x.promoterName)} · registrado às ${fmtTime(x.registered.at)} em ${esc(st.name)}`)
              .addTo(map);
            if (st.lat != null && st.lng != null) {
              L.polyline([[st.lat, st.lng], [x.registered.lat, x.registered.lng]], { color: "#6b21a8", weight: 1.5, dashArray: "4 4", opacity: 0.7 }).addTo(map);
            }
            bounds.push([x.registered.lat, x.registered.lng]);
          }
        }
      }
      if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      else map.setView([-19.92, -43.94], 11); // Belo Horizonte
      mapRef.current = { L, map };
      setReady((n) => n + 1);
    })();
    return () => {
      disposed = true;
      mapRef.current = null;
      map?.remove();
    };
  }, [stores, showRegistered]);

  // Promotores ao vivo: camada própria, trocada a cada atualização sem recriar o mapa.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !live) return;
    const layer = m.L.layerGroup();
    for (const p of live) {
      const here = p.current;
      // Onde está agora: a posição enviada pelo celular; sem ela, a loja aberta (ou a próxima do roteiro).
      const pos = p.position;
      const target = pos ?? here ?? (p.status === "done" ? null : p.next);
      if (!target || target.lat == null || target.lng == null) continue;
      const where = here
        ? `está em <b>${esc(here.storeName)}</b> desde ${fmtTime(here.since)}`
        : p.next && p.status !== "done"
          ? `próxima loja: <b>${esc(p.next.storeName)}</b>${p.next.plannedStart ? ` (prevista ${esc(p.next.plannedStart)})` : ""}${p.next.late ? " · atrasada" : ""}`
          : "sem loja aberta";
      const label = `<b>${esc(p.name)}</b> ${where}${pos ? `<br>posição do celular às ${fmtTime(pos.at)}${pos.accuracyM ? ` (±${Math.round(pos.accuracyM)} m)` : ""}` : ""}${p.online ? " · online" : ""}`;
      m.L.marker([target.lat, target.lng], { icon: liveIcon(m.L, p, Boolean(here) || Boolean(pos)), zIndexOffset: here ? 1000 : 500, title: p.name }).bindTooltip(label, { direction: "top", offset: [0, -14] }).addTo(layer);
    }
    layer.addTo(m.map);
    return () => {
      layer.remove();
    };
  }, [live, ready]);

  useEffect(() => {
    const m = mapRef.current;
    if (m && focus) m.map.flyTo([focus.lat, focus.lng], 16, { duration: 0.8 });
  }, [focus, ready]);

  return (
    <div>
      <style>{`@keyframes mcxPulse{0%{box-shadow:0 0 0 0 rgba(29,94,166,.55)}70%{box-shadow:0 0 0 14px rgba(29,94,166,0)}100%{box-shadow:0 0 0 0 rgba(29,94,166,0)}}`}</style>
      <div ref={el} className="h-[520px] w-full rounded-[var(--radius-card)] border border-line overflow-hidden bg-subtle z-0" role="region" aria-label="Mapa das lojas" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-[12.5px] text-ink-2">
        {(["completed", "in_progress"] as MapStatus[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-full border-2 border-brand-900" style={{ background: MAP_STATUS_COLOR[k] }} />
            {MAP_STATUS_LABEL[k]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-full border-2" style={{ borderColor: "#ff1a1a", boxShadow: "0 0 0 2px rgba(255,26,26,.3)" }} />
          Check-in fora da loja
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-full border-2 border-dashed border-brand-900" />
          Loja sem endereço (posição aproximada pelo check-in)
        </span>
        {hasRegistered ? (
          <label className="inline-flex items-center gap-1.5 ml-auto">
            <input type="checkbox" checked={showRegistered} onChange={(e) => setShowRegistered(e.target.checked)} />
            <span className="size-2.5 rotate-45 border-2 border-purple-800 bg-white" /> Localização registrada pelo promotor (início da visita)
          </label>
        ) : null}
      </div>
    </div>
  );
}
