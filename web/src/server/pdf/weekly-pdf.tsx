/* eslint-disable jsx-a11y/alt-text -- <Image> do react-pdf não é um <img> HTML e não aceita alt. */
/**
 * PDF executivo do relatório semanal — destinado ao gestor da marca SUINCO.
 * Capa + resumo executivo + gráficos + rankings + insights + recomendações.
 * Gráficos desenhados com primitivas do PDF (vetoriais, nítidos em qualquer zoom).
 */
import "server-only";
import { Document, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { base, C, Footer, LOGOS, SectionTitle } from "./theme";
import { reportTitle, type WeeklyReportData } from "../weekly-report";
import { SEVERITY_COLOR, SEVERITY_LABEL, STORE_STATUS_LABEL, LOCATION_LABEL, type Location } from "@/lib/domain";
import { formatIsoBr } from "@/lib/validity";


const SERIES = { nearExpiry: "#2a78d6", ruptures: "#eb6834", damages: "#1baf7a" } as const;

function delta(cur: number, prev: number) {
  if (prev === 0) return cur === 0 ? "—" : "novo";
  const p = Math.round(((cur - prev) / prev) * 100);
  return `${p > 0 ? "+" : ""}${p}% vs. período anterior`;
}

function Cover({ d }: { d: WeeklyReportData }) {
  return (
    <Page size="A4" style={{ backgroundColor: C.navy, padding: 56, color: "#FFFFFF", fontFamily: "Helvetica" }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {LOGOS.af ? <Image src={{ data: LOGOS.af, format: "png" }} style={{ width: 58, height: 58, borderRadius: 29 }} /> : null}
        {LOGOS.mcx ? <Image src={{ data: LOGOS.mcx, format: "png" }} style={{ width: 54, height: 54, marginLeft: 14, borderRadius: 6 }} /> : null}
      </View>
      <View style={{ marginTop: 200 }}>
        <Text style={{ color: C.gold, fontFamily: "Helvetica-Bold", fontSize: 12, letterSpacing: 4 }}>{d.clientName.toUpperCase()}</Text>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 38, marginTop: 10 }}>{reportTitle(d)}</Text>
        <Text style={{ fontSize: 15, color: "#C9CED9", marginTop: 8 }}>Validades, rupturas e avarias nas lojas</Text>
        <View style={{ width: 70, height: 2, backgroundColor: C.gold, marginTop: 26, marginBottom: 26 }} />
        <Text style={{ fontSize: 11, color: "#C9CED9", textTransform: "uppercase", letterSpacing: 1.5 }}>Período analisado</Text>
        <Text style={{ fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 4 }}>
          {formatIsoBr(d.period.start)} a {formatIsoBr(d.period.end)}
        </Text>
      </View>
      <View style={{ position: "absolute", bottom: 56, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 10, color: "#C9CED9" }}>AF Merchandising · Operação {d.clientName}</Text>
        <Text style={{ fontSize: 10, color: "#C9CED9" }}>Plataforma MCX</Text>
      </View>
    </Page>
  );
}

function KpiGrid({ d }: { d: WeeklyReportData }) {
  const k = d.kpis;
  const p = d.previousKpis;
  const items: [string, number, number][] = [
    ["Visitas realizadas", k.visits, p.visits],
    ["Lojas visitadas", k.storesVisited, p.storesVisited],
    ["Próximos ao vencimento", k.nearExpiry, p.nearExpiry],
    ["Produtos vencidos", k.expired, p.expired],
    ["Rupturas", k.ruptures, p.ruptures],
    ["Avarias", k.damages, p.damages],
  ];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }}>
      {items.map(([label, v, pv]) => (
        <View key={label} style={{ width: "33.33%", padding: 4 }}>
          <View style={{ backgroundColor: C.canvas, borderRadius: 6, padding: 12 }}>
            <Text style={{ fontSize: 7.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Text>
            <Text style={{ fontSize: 22, fontFamily: "Helvetica-Bold", color: label === "Produtos vencidos" && v > 0 ? "#B42318" : C.navy, marginTop: 2 }}>{v}</Text>
            <Text style={{ fontSize: 7.5, color: C.ink2 }}>{delta(v, pv)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function SeverityBars({ d }: { d: WeeklyReportData }) {
  const max = Math.max(1, ...d.severity.map((x) => x.items));
  return (
    <View>
      {d.severity.map((x) => (
        <View key={x.severity} style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
          <Text style={{ width: 84, fontSize: 8.5, color: C.ink2, fontFamily: "Helvetica-Bold" }}>{SEVERITY_LABEL[x.severity]}</Text>
          <View style={{ flex: 1, height: 11, backgroundColor: C.canvas, borderRadius: 2 }}>
            <View style={{ width: `${(x.items / max) * 100}%`, height: 11, backgroundColor: SEVERITY_COLOR[x.severity].solid, borderRadius: 2 }} />
          </View>
          <Text style={{ width: 30, textAlign: "right", fontSize: 8.5, fontFamily: "Helvetica-Bold" }}>{x.items}</Text>
        </View>
      ))}
    </View>
  );
}

function DailyBars({ d }: { d: WeeklyReportData }) {
  const max = Math.max(1, ...d.daily.map((x) => x.nearExpiry + x.ruptures + x.damages));
  const H = 110;
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: H, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
        {d.daily.map((x) => (
          <View key={x.day} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 7, color: C.ink2, marginBottom: 2 }}>{x.nearExpiry + x.ruptures + x.damages || ""}</Text>
            <View style={{ width: 22 }}>
              {(["damages", "ruptures", "nearExpiry"] as const).map((k) =>
                x[k] ? <View key={k} style={{ height: (x[k] / max) * (H - 14), backgroundColor: SERIES[k], borderBottomWidth: 1, borderBottomColor: "#FFFFFF" }} /> : null,
              )}
            </View>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row" }}>
        {d.daily.map((x) => (
          <Text key={x.day} style={{ flex: 1, textAlign: "center", fontSize: 7.5, color: C.muted, marginTop: 3 }}>
            {formatIsoBr(x.day, false)}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", marginTop: 6 }}>
        {(
          [
            ["nearExpiry", "Validade (vencidos e próximos)"],
            ["ruptures", "Rupturas"],
            ["damages", "Avarias"],
          ] as const
        ).map(([k, l]) => (
          <View key={k} style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
            <View style={{ width: 7, height: 7, backgroundColor: SERIES[k], marginRight: 4 }} />
            <Text style={{ fontSize: 7.5, color: C.ink2 }}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Table({ head, rows, empty }: { head: { label: string; flex: number; align?: "right" | "left" }[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <Text style={base.empty}>{empty}</Text>;
  return (
    <View>
      <View style={base.trHead}>
        {head.map((h) => (
          <Text key={h.label} style={[base.th, { flex: h.flex, textAlign: h.align ?? "left", paddingRight: 10 }]}>
            {h.label}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={[base.tr, i % 2 ? { backgroundColor: C.zebra } : {}]} wrap={false}>
          {r.map((c, j) => (
            <Text key={j} style={{ flex: head[j].flex, textAlign: head[j].align ?? "left", fontFamily: j === 0 ? "Helvetica-Bold" : "Helvetica", paddingRight: 10 }}>
              {String(c)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Header({ d }: { d: WeeklyReportData }) {
  return (
    <View style={{ backgroundColor: C.navy, paddingHorizontal: 32, paddingVertical: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }} fixed>
      <Text style={{ color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 11 }}>{reportTitle(d)} — {d.clientName}</Text>
      <Text style={{ color: "#C9CED9", fontSize: 9 }}>
        {formatIsoBr(d.period.start)} a {formatIsoBr(d.period.end)}
      </Text>
    </View>
  );
}

function WeeklyDocument({ d }: { d: WeeklyReportData }) {
  return (
    <Document title={`${reportTitle(d)} ${d.clientName} ${d.period.start} a ${d.period.end}`} author="AF Merchandising" creator="MCX · SUINCO Gestão de Loja">
      <Cover d={d} />
      <Page size="A4" style={base.page}>
        <Header d={d} />
        <View style={base.body}>
          <SectionTitle>Resumo executivo</SectionTitle>
          <KpiGrid d={d} />

          <View style={{ flexDirection: "row", marginTop: 6 }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <SectionTitle>Itens por faixa de validade</SectionTitle>
              <SeverityBars d={d} />
            </View>
            <View style={{ flex: 1.15 }}>
              <SectionTitle>Ocorrências por dia</SectionTitle>
              <DailyBars d={d} />
            </View>
          </View>

          <SectionTitle>Principais insights</SectionTitle>
          {d.insights.length ? (
            d.insights.slice(0, 7).map((i, n) => (
              <View key={n} style={{ flexDirection: "row", marginBottom: 5 }} wrap={false}>
                <View style={{ width: 4, backgroundColor: i.tone === "critical" ? "#B42318" : i.tone === "warning" ? "#C98500" : i.tone === "positive" ? "#2F9E5B" : "#2a78d6", borderRadius: 2, marginRight: 8 }} />
                <Text style={{ flex: 1, lineHeight: 1.4 }}>{i.text}</Text>
              </View>
            ))
          ) : (
            <Text style={base.empty}>Sem destaques: dados insuficientes para comparações nesta semana.</Text>
          )}

          <SectionTitle>Top 10 produtos próximos ao vencimento</SectionTitle>
          <Table
            head={[{ label: "Produto", flex: 3.2 }, { label: "Quantidade", flex: 1.1, align: "right" }, { label: "Lojas afetadas", flex: 1.2, align: "right" }, { label: "Menor validade", flex: 1.3, align: "right" }]}
            rows={d.topProducts.map((p) => [p.name, `${p.units} un`, p.stores, formatIsoBr(p.minExpiry)])}
            empty="Nenhum produto próximo ao vencimento na semana."
          />

          <SectionTitle>Top 10 lojas mais críticas</SectionTitle>
          <Table
            head={[{ label: "Loja", flex: 2.6 }, { label: "Cidade", flex: 1.6 }, { label: "Ocorrências", flex: 1.1, align: "right" }, { label: "Índice", flex: 0.9, align: "right" }, { label: "Situação", flex: 1.1 }]}
            rows={d.topStores.map((s) => [s.name, s.city, s.occurrences, s.index, STORE_STATUS_LABEL[s.health]])}
            empty="Nenhuma loja com ocorrências na semana."
          />
          {d.topStores.length ? (
            <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 4 }}>
              Índice de criticidade: soma ponderada de vencidos, críticos, altos, rupturas, avarias e itens em atenção (pesos definidos pela operação).
            </Text>
          ) : null}

          <SectionTitle>Produtos vencidos</SectionTitle>
          <Table
            head={[{ label: "Produto", flex: 2.6 }, { label: "Loja", flex: 2.2 }, { label: "Qtd", flex: 0.8, align: "right" }, { label: "Validade", flex: 1.1, align: "right" }, { label: "Local", flex: 1.2 }]}
            rows={d.expired.map((x) => [x.product, x.store, `${x.quantity ?? "—"} ${x.unit}`, formatIsoBr(x.expiryDate), LOCATION_LABEL[x.location as Location] ?? x.location])}
            empty="Nenhum produto vencido encontrado na semana."
          />

          <View style={{ flexDirection: "row", marginTop: 4 }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <SectionTitle>{`Rupturas · ${d.ruptures.total}`}</SectionTitle>
              <Table
                head={[{ label: "Produto", flex: 3 }, { label: "Registros", flex: 1.1, align: "right" }, { label: "Lojas", flex: 0.9, align: "right" }]}
                rows={d.ruptures.byProduct.map((r) => [r.name, r.count, r.stores])}
                empty="Nenhuma ruptura registrada."
              />
            </View>
            <View style={{ flex: 1 }}>
              <SectionTitle>{`Avarias · ${d.damages.total}`}</SectionTitle>
              <Table
                head={[{ label: "Produto", flex: 3 }, { label: "Registros", flex: 1.1, align: "right" }, { label: "Unid.", flex: 0.9, align: "right" }]}
                rows={d.damages.byProduct.map((r) => [r.name, r.count, r.units])}
                empty="Nenhuma avaria registrada."
              />
              {d.damages.byKind.length ? (
                <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 4 }}>Por tipo: {d.damages.byKind.map((k) => `${k.kind} (${k.count})`).join(", ")}</Text>
              ) : null}
            </View>
          </View>

          <SectionTitle>Recomendações</SectionTitle>
          {d.recommendations.length ? (
            d.recommendations.map((r, n) => (
              <View key={n} style={{ flexDirection: "row", marginBottom: 4 }} wrap={false}>
                <Text style={{ width: 14, color: C.gold, fontFamily: "Helvetica-Bold" }}>{n + 1}.</Text>
                <Text style={{ flex: 1, lineHeight: 1.4 }}>{r}</Text>
              </View>
            ))
          ) : (
            <Text style={base.empty}>Operação dentro do esperado — manter a rotina de visitas.</Text>
          )}
        </View>
        <Footer left={`AF Merchandising · Operação ${d.clientName} · Relatório gerado automaticamente pelo sistema`} />
      </Page>
    </Document>
  );
}

export function renderWeeklyPdf(d: WeeklyReportData): Promise<Buffer> {
  return renderToBuffer(<WeeklyDocument d={d} />);
}


