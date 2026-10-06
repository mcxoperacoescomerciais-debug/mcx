"use client";

/**
 * Mapa das lojas (Leaflet + OpenStreetMap, sem custo de API). A cor do ponto
 * é a situação da loja (status) e o popup traz os números — a cor nunca é a
 * única informação.
 */
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import type { StoreHealth } from "@/lib/domain";

export interface MapStore {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  health: StoreHealth;
  lastVisit: string | null;
  nearExpiry: number;
  expired: number;
  ruptures: number;
  damages: number;
}

export const HEALTH_COLOR: Record<StoreHealth, string> = { normal: "#2F9E5B", attention: "#E3B008", critical: "#E5484D" };
const HEALTH_LABEL: Record<StoreHealth, string> = { normal: "Normal", attention: "Atenção", critical: "Crítica" };

const Inner = dynamic(
  async () => {
    const { MapContainer, TileLayer, CircleMarker, Popup } = await import("react-leaflet");
    function MapInner({ stores }: { stores: MapStore[] }) {
      const center: [number, number] = stores.length
        ? [stores.reduce((n, s) => n + s.lat, 0) / stores.length, stores.reduce((n, s) => n + s.lng, 0) / stores.length]
        : [-19.9, -44.9];
      return (
        <MapContainer center={center} zoom={8} scrollWheelZoom={false} style={{ height: "100%", width: "100%", borderRadius: 12 }}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {stores.map((s) => (
            <CircleMarker
              key={s.id}
              center={[s.lat, s.lng]}
              radius={s.health === "critical" ? 11 : 9}
              pathOptions={{ color: "#fff", weight: 2, fillColor: HEALTH_COLOR[s.health], fillOpacity: 0.95 }}
            >
              <Popup>
                <div style={{ fontFamily: "inherit", minWidth: 180 }}>
                  <strong style={{ fontSize: 14 }}>{s.name}</strong>
                  <div style={{ color: "#6B7290", fontSize: 12 }}>
                    {s.city} · {HEALTH_LABEL[s.health]}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>
                    Última visita: <b>{s.lastVisit ? s.lastVisit.split("-").reverse().join("/") : "—"}</b>
                    <br />
                    Próximos ao vencimento: <b>{s.nearExpiry}</b> · Vencidos: <b>{s.expired}</b>
                    <br />
                    Rupturas: <b>{s.ruptures}</b> · Avarias: <b>{s.damages}</b>
                  </div>
                  <a href={`/painel/lojas/${s.id}`} style={{ fontSize: 12, fontWeight: 600 }}>
                    Abrir loja →
                  </a>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      );
    }
    return MapInner;
  },
  { ssr: false, loading: () => <div className="h-full w-full rounded-xl bg-navy-50 animate-pulse" /> },
);

export function StoreMap({ stores, height = 360 }: { stores: MapStore[]; height?: number }) {
  return (
    <div>
      <div style={{ height }} className="relative z-0">
        <Inner stores={stores} />
      </div>
      <div className="flex gap-4 mt-3 text-[12px] text-ink-2">
        {(Object.keys(HEALTH_LABEL) as StoreHealth[]).map((h) => (
          <span key={h} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: HEALTH_COLOR[h] }} /> {HEALTH_LABEL[h]}
          </span>
        ))}
      </div>
    </div>
  );
}
