/* eslint-disable jsx-a11y/alt-text -- <Image> do react-pdf não é um <img> HTML e não aceita alt. */
/**
 * PDF da visita — o documento que o promotor envia no grupo do WhatsApp.
 * Pensado para leitura no celular: poucas colunas, fonte legível, o que é
 * urgente primeiro (tabelas ordenadas por dias para vencer).
 */
import "server-only";
import { Document, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { base, C, Footer, LOGOS, SectionTitle, SeverityPill } from "./theme";
import { groupOccurrences, type VisitDetail, type VisitOccurrence } from "../visits";
import { storage } from "../storage";
import { DAMAGE_KIND_LABEL, LOCATION_LABEL, RUPTURE_KIND_LABEL } from "@/lib/domain";
import { describeDays, formatIsoBr } from "@/lib/validity";

const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

type PhotoData = { id: string; data: Buffer; format: "jpg" | "png"; caption: string };

/** Formato pelo conteúdo do arquivo (não pela extensão). O PDF só aceita JPEG e PNG. */
function imageFormat(bytes: Uint8Array): "jpg" | "png" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  return null;
}

function Header({ visit }: { visit: VisitDetail }) {
  return (
    <View style={{ backgroundColor: C.navy, paddingHorizontal: 32, paddingTop: 26, paddingBottom: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <View>
        <Text style={{ color: C.gold, fontFamily: "Helvetica-Bold", fontSize: 9, letterSpacing: 2.5 }}>
          {visit.client.name.toUpperCase()}
        </Text>
        <Text style={{ color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 20, marginTop: 3 }}>Relatório de Visita</Text>
        <Text style={{ color: "#C9CED9", fontSize: 9, marginTop: 3 }}>AF Merchandising · Validades, rupturas e avarias</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {LOGOS.af ? <Image src={{ data: LOGOS.af, format: "png" }} style={{ width: 40, height: 40, borderRadius: 20 }} /> : null}
        {LOGOS.mcx ? <Image src={{ data: LOGOS.mcx, format: "png" }} style={{ width: 38, height: 38, marginLeft: 10, borderRadius: 4 }} /> : null}
      </View>
    </View>
  );
}

function InfoGrid({ visit }: { visit: VisitDetail }) {
  const time = `${timeFmt.format(visit.startedAt)}${visit.finishedAt ? ` – ${timeFmt.format(visit.finishedAt)}` : ""}`;
  const items: [string, string][] = [
    ["Loja", `${visit.store.name}${visit.store.code ? ` · Loja ${visit.store.code}` : ""}`],
    ["Rede", visit.store.network],
    ["Cidade", `${visit.store.city} – ${visit.store.state}`],
    ["Data", formatIsoBr(visit.visitDate)],
    ["Horário", time],
    ["Promotor", visit.promoter.name],
  ];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 16, borderWidth: 0.5, borderColor: C.line, borderRadius: 6 }}>
      {items.map(([label, value], i) => (
        <View
          key={label}
          style={{
            width: "33.33%",
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRightWidth: i % 3 === 2 ? 0 : 0.5,
            borderBottomWidth: i < 3 ? 0.5 : 0,
            borderColor: C.line,
          }}
        >
          <Text style={{ fontSize: 7.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Text>
          <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 2 }}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function Summary({ groups }: { groups: ReturnType<typeof groupOccurrences> }) {
  const near = groups.salesFloor.filter((o) => o.severity && o.severity !== "normal" && o.severity !== "expired").length;
  const expired = [...groups.salesFloor, ...groups.stock].filter((o) => o.severity === "expired").length;
  const cards: [string, number, string][] = [
    ["Área de vendas", groups.salesFloor.length, `${near} próximos ao vencimento`],
    ["Estoque", groups.stock.length, "itens com validade"],
    ["Rupturas", groups.ruptures.length, "produtos em falta"],
    ["Avarias", groups.damages.length, "registros"],
  ];
  return (
    <View>
      <View style={{ flexDirection: "row", marginTop: 14, marginHorizontal: -4 }}>
        {cards.map(([label, value, hint]) => (
          <View key={label} style={{ flex: 1, marginHorizontal: 4, backgroundColor: C.canvas, borderRadius: 6, padding: 10 }}>
            <Text style={{ fontSize: 7.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Text>
            <Text style={{ fontSize: 20, fontFamily: "Helvetica-Bold", color: C.navy, marginTop: 2 }}>{value}</Text>
            <Text style={{ fontSize: 7.5, color: C.ink2 }}>{hint}</Text>
          </View>
        ))}
      </View>
      {expired > 0 ? (
        <View style={{ marginTop: 8, backgroundColor: "#FDE8E8", borderRadius: 6, paddingVertical: 7, paddingHorizontal: 10, borderLeftWidth: 3, borderLeftColor: "#B42318" }}>
          <Text style={{ color: "#8E1B1B", fontFamily: "Helvetica-Bold", fontSize: 9 }}>
            Atenção: {expired} {expired === 1 ? "item vencido encontrado" : "itens vencidos encontrados"} nesta visita.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ValidityTable({ rows, showLocation, photoRefs }: { rows: VisitOccurrence[]; showLocation?: boolean; photoRefs: Record<string, string> }) {
  if (!rows.length) return <Text style={base.empty}>Nenhuma ocorrência registrada.</Text>;
  const showPrice = rows.some((o) => o.price);
  return (
    <View>
      <View style={base.trHead}>
        <Text style={[base.th, { flex: 3.4 }]}>Produto</Text>
        <Text style={[base.th, { flex: 1, textAlign: "right" }]}>Qtd</Text>
        <Text style={[base.th, { flex: 1.4, textAlign: "center" }]}>Validade</Text>
        <Text style={[base.th, { flex: 1.4 }]}>Dias</Text>
        {showPrice ? <Text style={[base.th, { flex: 1.1, textAlign: "right", paddingRight: 8 }]}>Preço</Text> : null}
        {showLocation ? <Text style={[base.th, { flex: 1.3 }]}>Local</Text> : null}
        <Text style={[base.th, { flex: 1.6 }]}>Classificação</Text>
      </View>
      {rows.map((o, i) => (
        <View key={o.id} style={[base.tr, i % 2 ? { backgroundColor: C.zebra } : {}]} wrap={false}>
          <View style={{ flex: 3.4, paddingRight: 6 }}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{o.productName}</Text>
            {o.lot || o.notes || photoRefs[o.id] ? (
              <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>
                {[photoRefs[o.id], o.lot ? `Lote ${o.lot}` : null, o.notes].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
          </View>
          <Text style={{ flex: 1, textAlign: "right", paddingRight: 8 }}>
            {o.quantity} {o.unit}
          </Text>
          <Text style={{ flex: 1.4, textAlign: "center" }}>{formatIsoBr(o.expiryDate)}</Text>
          <Text style={{ flex: 1.4 }}>{o.daysToExpiry === null ? "—" : describeDays(o.daysToExpiry)}</Text>
          {showPrice ? (
            <Text style={{ flex: 1.1, textAlign: "right", paddingRight: 8 }}>{o.price ? `R$ ${Number(o.price).toFixed(2).replace(".", ",")}` : "—"}</Text>
          ) : null}
          {showLocation ? <Text style={{ flex: 1.3 }}>{LOCATION_LABEL[o.location]}</Text> : null}
          <View style={{ flex: 1.6 }}>{o.severity ? <SeverityPill severity={o.severity} /> : null}</View>
        </View>
      ))}
    </View>
  );
}

function SimpleTable({ head, rows }: { head: { label: string; flex: number }[]; rows: { key: string; cells: string[] }[] }) {
  if (!rows.length) return <Text style={base.empty}>Nenhuma ocorrência registrada.</Text>;
  return (
    <View>
      <View style={base.trHead}>
        {head.map((h) => (
          <Text key={h.label} style={[base.th, { flex: h.flex }]}>
            {h.label}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={r.key} style={[base.tr, i % 2 ? { backgroundColor: C.zebra } : {}]} wrap={false}>
          {r.cells.map((c, j) => (
            <Text key={j} style={{ flex: head[j].flex, fontFamily: j === 0 ? "Helvetica-Bold" : "Helvetica", paddingRight: 6 }}>
              {c}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Photos({ photos }: { photos: PhotoData[] }) {
  if (!photos.length) return null;
  return (
    <View break={photos.length > 2}>
      <SectionTitle>Registro fotográfico</SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 }}>
        {photos.map((p) => (
          <View key={p.id} style={{ width: "50%", paddingHorizontal: 5, marginBottom: 10 }} wrap={false}>
            <Image src={{ data: p.data, format: p.format }} style={{ width: "100%", height: 190, objectFit: "cover", borderRadius: 4 }} />
            <Text style={{ fontSize: 8, color: C.ink2, marginTop: 3 }}>{p.caption}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function VisitDocument({ visit, photos, photoRefs }: { visit: VisitDetail; photos: PhotoData[]; photoRefs: Record<string, string> }) {
  const g = groupOccurrences(visit.occurrences);
  return (
    <Document title={`Relatório de Visita — ${visit.store.name} — ${formatIsoBr(visit.visitDate)}`} author="AF Merchandising" creator="MCX · SUINCO Gestão de Loja">
      <Page size="A4" style={base.page}>
        <Header visit={visit} />
        <View style={base.body}>
          <InfoGrid visit={visit} />
          <Summary groups={g} />

          <SectionTitle>Produtos na área de vendas × Validade</SectionTitle>
          <ValidityTable rows={g.salesFloor} showLocation={g.salesFloor.some((o) => o.location !== "sales_floor")} photoRefs={photoRefs} />

          <SectionTitle>Produtos em estoque × Validade</SectionTitle>
          <ValidityTable rows={g.stock} photoRefs={photoRefs} />

          <SectionTitle>Rupturas</SectionTitle>
          <SimpleTable
            head={[{ label: "Produto", flex: 3 }, { label: "Situação", flex: 2 }, { label: "Observação", flex: 3 }]}
            rows={g.ruptures.map((o) => ({ key: o.id, cells: [withRef(o.productName, photoRefs[o.id]), o.ruptureKind ? RUPTURE_KIND_LABEL[o.ruptureKind] : "—", o.notes ?? "—"] }))}
          />

          <SectionTitle>Avarias</SectionTitle>
          <SimpleTable
            head={[{ label: "Produto", flex: 3 }, { label: "Qtd", flex: 1 }, { label: "Tipo", flex: 2 }, { label: "Observação", flex: 3 }]}
            rows={g.damages.map((o) => ({
              key: o.id,
              cells: [withRef(o.productName, photoRefs[o.id]), `${o.quantity ?? "—"} ${o.unit}`, o.damageKind ? DAMAGE_KIND_LABEL[o.damageKind] : "—", o.notes ?? "—"],
            }))}
          />

          <SectionTitle>Observações gerais</SectionTitle>
          {visit.notes ? <Text style={{ lineHeight: 1.45, paddingHorizontal: 6 }}>{visit.notes}</Text> : <Text style={base.empty}>Sem observações.</Text>}

          <Photos photos={photos} />
        </View>
        <Footer left={`Relatório gerado automaticamente pelo sistema · ${dateTimeFmt.format(new Date())} · ID ${visit.id.slice(0, 8)}`} />
      </Page>
    </Document>
  );
}

const withRef = (name: string, ref: string | undefined) => (ref ? `${name} (${ref})` : name);

export async function renderVisitPdf(visit: VisitDetail): Promise<Buffer> {
  const photos: PhotoData[] = [];
  /** "Foto 1, 2" por ocorrência: liga a linha da tabela às imagens no fim do relatório. */
  const photoRefs: Record<string, string> = {};
  const g = groupOccurrences(visit.occurrences);
  // Numeração na mesma ordem em que os itens aparecem no relatório.
  for (const o of [...g.salesFloor, ...g.stock, ...g.ruptures, ...g.damages]) {
    for (const p of o.photos) {
      const data = await storage().get(p.storageKey).catch(() => null);
      if (!data) continue;
      const detail =
        o.type === "validity"
          ? `${o.quantity} ${o.unit} · val. ${formatIsoBr(o.expiryDate)}`
          : o.type === "damage"
            ? `Avaria · ${o.damageKind ? DAMAGE_KIND_LABEL[o.damageKind] : ""}`
            : "Ruptura";
      const format = imageFormat(data);
      if (!format) continue;
      const n = photos.length + 1;
      photoRefs[o.id] = photoRefs[o.id] ? `${photoRefs[o.id]}, ${n}` : `Foto ${n}`;
      photos.push({ id: p.id, data: Buffer.from(data), format, caption: `Foto ${n} · ${o.productName} — ${detail}` });
    }
  }
  return renderToBuffer(<VisitDocument visit={visit} photos={photos} photoRefs={photoRefs} />);
}
