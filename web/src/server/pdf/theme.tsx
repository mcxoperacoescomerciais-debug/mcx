/**
 * Identidade visual compartilhada pelos PDFs (visita e semanal). Helvetica
 * padrão do PDF cobre todos os acentos do português e não exige baixar fonte.
 */
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { SEVERITY_COLOR, SEVERITY_LABEL, type Severity } from "@/lib/domain";

export const C = {
  navy: "#0B1236",
  navy2: "#1F2A63",
  gold: "#C9A227",
  ink: "#0E1430",
  ink2: "#3C4462",
  muted: "#6B7290",
  line: "#E3E6EE",
  zebra: "#F6F7FB",
  canvas: "#F2F4FA",
};

function loadAsset(name: string): Buffer | null {
  try {
    return readFileSync(path.join(process.cwd(), "public", name));
  } catch {
    return null;
  }
}

export const LOGOS = { af: loadAsset("af_logo.png"), mcx: loadAsset("mcx_logo.png") };

export const base = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 48, paddingHorizontal: 0, fontFamily: "Helvetica", fontSize: 9.5, color: C.ink },
  body: { paddingHorizontal: 32 },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: C.navy,
    marginTop: 18,
    marginBottom: 8,
    paddingBottom: 5,
    borderBottomWidth: 1.5,
    borderBottomColor: C.gold,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  tr: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.line, alignItems: "center" },
  trHead: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, backgroundColor: C.canvas, borderRadius: 3 },
  empty: { fontSize: 9, color: C.muted, fontStyle: "italic", paddingVertical: 6, paddingHorizontal: 6 },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: C.muted,
    borderTopWidth: 0.5,
    borderTopColor: C.line,
    paddingTop: 6,
  },
});

export function SeverityPill({ severity }: { severity: Severity }) {
  const c = SEVERITY_COLOR[severity];
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 6, alignSelf: "flex-start" }}>
      <Text style={{ color: c.fg, fontFamily: "Helvetica-Bold", fontSize: 7.5, textTransform: "uppercase" }}>
        {SEVERITY_LABEL[severity]}
      </Text>
    </View>
  );
}

export function Footer({ left }: { left: string }) {
  return (
    <View style={base.footer} fixed>
      <Text>{left}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={base.sectionTitle} minPresenceAhead={60}>
      {children}
    </Text>
  );
}
