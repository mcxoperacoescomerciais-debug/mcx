/**
 * Identidade visual dos PDFs (cabeçalho, rodapé com paginação, seções,
 * tabelas e selos). Helvetica padrão cobre os acentos do português.
 */
import "server-only";
import type { ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "../db";

/** Identidade da agência no PDF (logo só PNG/JPEG — o renderizador não lê WebP). */
export interface PdfAgency {
  name: string;
  logo: string | null;
}

export async function pdfAgency(scope: { agencyId: string; agencyName: string }): Promise<PdfAgency> {
  const db = await getDb();
  const [a] = await db.select({ logo: s.agencies.logo }).from(s.agencies).where(eq(s.agencies.id, scope.agencyId));
  const logo = a?.logo && /^data:image\/(png|jpeg);/.test(a.logo) ? a.logo : null;
  return { name: scope.agencyName, logo };
}

export const C = {
  brand: "#0C323A",
  brand2: "#17535F",
  accent: "#2A8494",
  ink: "#141A1C",
  ink2: "#3C4548",
  muted: "#687175",
  line: "#E5E5E0",
  zebra: "#FAFAF8",
  canvas: "#F5F5F2",
  ok: "#1D7348",
  okBg: "#E5F3EB",
  warn: "#9A5800",
  warnBg: "#FCF0DC",
  bad: "#B42318",
  badBg: "#FDEBE9",
  info: "#1D5EA6",
  infoBg: "#E7F0FB",
  sync: "#6447AD",
  syncBg: "#EFEAFB",
};

export type PdfTone = "neutral" | "success" | "warning" | "danger" | "info" | "sync" | "muted";
const TONE: Record<PdfTone, { fg: string; bg: string }> = {
  neutral: { fg: C.ink2, bg: C.canvas },
  success: { fg: C.ok, bg: C.okBg },
  warning: { fg: C.warn, bg: C.warnBg },
  danger: { fg: C.bad, bg: C.badBg },
  info: { fg: C.info, bg: C.infoBg },
  sync: { fg: C.sync, bg: C.syncBg },
  muted: { fg: C.muted, bg: C.canvas },
};

export const base = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 46, paddingHorizontal: 0, fontFamily: "Helvetica", fontSize: 9, color: C.ink },
  body: { paddingHorizontal: 30 },
  h2: { fontFamily: "Helvetica-Bold", fontSize: 11, color: C.brand, marginTop: 16, marginBottom: 7, paddingBottom: 4, borderBottomWidth: 1.2, borderBottomColor: C.accent },
  h3: { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: C.ink, marginTop: 10, marginBottom: 5 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: C.muted, textTransform: "uppercase" },
  tr: { flexDirection: "row", paddingVertical: 4.5, paddingHorizontal: 5, borderBottomWidth: 0.5, borderBottomColor: C.line, alignItems: "center" },
  trHead: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 5, backgroundColor: C.canvas },
  empty: { fontSize: 8.5, color: C.muted, fontStyle: "italic", paddingVertical: 5 },
  footer: { position: "absolute", bottom: 16, left: 30, right: 30, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.muted, borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 5 },
});

export function Header({ agency, title, subtitle, right }: { agency: PdfAgency; title: string; subtitle?: string; right?: string }) {
  return (
    <View style={{ backgroundColor: C.brand, paddingHorizontal: 30, paddingTop: 22, paddingBottom: 16, marginBottom: 6 }} fixed>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <View style={{ maxWidth: "75%", flexDirection: "row", alignItems: "center" }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do PDF não tem alt */}
          {agency.logo ? <Image src={agency.logo} style={{ width: 38, height: 38, borderRadius: 19, marginRight: 10, backgroundColor: "#FFFFFF" }} /> : null}
          <View>
          <Text style={{ color: "#BCDADF", fontSize: 8, letterSpacing: 1, textTransform: "uppercase" }}>{agency.name}</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 3 }}>{title}</Text>
          {subtitle ? <Text style={{ color: "#DCECEE", fontSize: 9, marginTop: 3 }}>{subtitle}</Text> : null}
          </View>
        </View>
        {right ? <Text style={{ color: "#BCDADF", fontSize: 8, textAlign: "right" }}>{right}</Text> : null}
      </View>
    </View>
  );
}

export function Footer({ left }: { left: string }) {
  return (
    <View style={base.footer} fixed>
      <Text>{left}</Text>
      <Text>por MCX Soluções Operacionais</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

export function H2({ children }: { children: string }) {
  return (
    <Text style={base.h2} minPresenceAhead={70}>
      {children}
    </Text>
  );
}

export function Pill({ tone, children }: { tone: PdfTone; children: string }) {
  const t = TONE[tone];
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: 7, paddingVertical: 1.5, paddingHorizontal: 5, alignSelf: "flex-start" }}>
      <Text style={{ color: t.fg, fontFamily: "Helvetica-Bold", fontSize: 7 }}>{children}</Text>
    </View>
  );
}

export interface Col<T> {
  label: string;
  width: string | number;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

export function PdfTable<T>({ cols, rows, empty = "Nenhum registro." }: { cols: Col<T>[]; rows: T[]; empty?: string }) {
  if (!rows.length) return <Text style={base.empty}>{empty}</Text>;
  return (
    <View>
      <View style={base.trHead} fixed>
        {cols.map((c) => (
          <Text key={c.label} style={[base.th, { width: c.width, textAlign: c.align ?? "left", paddingRight: 4 }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={[base.tr, i % 2 ? { backgroundColor: C.zebra } : {}]} wrap={false}>
          {cols.map((c) => {
            const v = c.render(r);
            return (
              <View key={c.label} style={{ width: c.width, alignItems: c.align === "right" ? "flex-end" : "flex-start", paddingRight: 4 }}>
                {typeof v === "string" || typeof v === "number" ? <Text style={{ fontSize: 8.5 }}>{v}</Text> : v}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function InfoGrid({ items }: { items: [string, string][] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", backgroundColor: C.canvas, borderRadius: 4, padding: 8 }}>
      {items.map(([k, v]) => (
        <View key={k} style={{ width: "25%", paddingVertical: 3, paddingRight: 6 }}>
          <Text style={{ fontSize: 7, color: C.muted, textTransform: "uppercase" }}>{k}</Text>
          <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 1 }}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

export function StatBoxes({ items }: { items: { label: string; value: string | number; tone?: PdfTone }[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {items.map((it) => {
        const t = TONE[it.tone ?? "neutral"];
        return (
          <View key={it.label} style={{ flex: 1, backgroundColor: t.bg, borderRadius: 4, paddingVertical: 7, paddingHorizontal: 8 }}>
            <Text style={{ fontSize: 15, fontFamily: "Helvetica-Bold", color: t.fg }}>{String(it.value)}</Text>
            <Text style={{ fontSize: 7.5, color: C.ink2, marginTop: 2 }}>{it.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function pdfResponse(bytes: Uint8Array | Buffer, filename: string, inline = false): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** Nome de arquivo sem acento/espaço. */
export function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
