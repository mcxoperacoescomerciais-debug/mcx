/**
 * PDF de atendimento por marca — usado sozinho (atendimento), em sequência
 * (visita: uma seção por marca, nunca misturadas) e no relatório da loja.
 */
import "server-only";
import { Document, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Scope } from "../auth";
import { getAttendanceDetail } from "../details";
import { storage } from "../storage";
import { C, Footer, H2, Header, InfoGrid, Pill, PdfTable, StatBoxes, base, type PdfAgency, type PdfTone } from "./kit";
import {
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_STATUS_TONE,
  EXCEPTION_ITEM_LABEL,
  EXCEPTION_REASON_LABEL,
  OCCURRENCE_CATEGORY_LABEL,
  OCCURRENCE_STATUS_LABEL,
  REVIEW_STATUS_LABEL,
  RUPTURE_SITUATION_LABEL,
  RUPTURE_STATUS_LABEL,
  RUPTURE_STATUS_TONE,
  STOCK_STATE_LABEL,
  STOCK_STATE_TONE,
  type StockDisplayState,
} from "@/lib/domain";
import { fmtDate, fmtDateTime, fmtDuration, fmtTime } from "@/lib/dates";

type Detail = NonNullable<Awaited<ReturnType<typeof getAttendanceDetail>>>;
type Img = { data: Buffer; format: "png" | "jpg" };

async function loadImage(storageKey: string | null, contentType: string | null): Promise<Img | null> {
  if (!storageKey) return null;
  const bytes = await storage().get(storageKey);
  if (!bytes) return null;
  return { data: Buffer.from(bytes), format: contentType === "image/png" ? "png" : "jpg" };
}

export interface AttendanceBlockData {
  d: Detail;
  images: Map<string, Img>;
}

export async function loadAttendanceBlock(scope: Scope, attendanceId: string, maxPhotos = 6): Promise<AttendanceBlockData | null> {
  const d = await getAttendanceDetail(scope, attendanceId);
  if (!d) return null;
  const images = new Map<string, Img>();
  const wanted = [...d.photos.filter((p) => p.kind === "before").slice(0, 2), ...d.photos.filter((p) => p.kind === "after").slice(0, 2), ...d.photos.filter((p) => p.kind === "rupture").slice(0, maxPhotos - 4)];
  await Promise.all(
    wanted.map(async (p) => {
      if (!p.uploadedAt) return;
      const img = await loadImage(p.storageKey, p.contentType);
      if (img) images.set(p.id, img);
    }),
  );
  return { d, images };
}

function PhotoBox({ label, photo, img }: { label: string; photo: Detail["photos"][number] | undefined; img: Img | undefined }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.muted, marginBottom: 3, textTransform: "uppercase" }}>{label}</Text>
      {photo && img ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image src={img} style={{ width: "100%", height: 170, objectFit: "cover", borderRadius: 3 }} />
      ) : (
        <View style={{ height: 170, borderRadius: 3, backgroundColor: photo ? C.syncBg : C.badBg, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ fontSize: 9, color: photo ? C.sync : C.bad, fontFamily: "Helvetica-Bold" }}>{photo ? "Foto aguardando sincronização" : `Sem foto do ${label.toLowerCase()}`}</Text>
        </View>
      )}
      {photo ? <Text style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>{fmtDateTime(photo.takenAt)} · {photo.source === "gallery" ? "galeria" : "câmera"}</Text> : null}
    </View>
  );
}

export function AttendanceBlock({ data, breakBefore = false }: { data: AttendanceBlockData; breakBefore?: boolean }) {
  const { d, images } = data;
  const a = d.attendance;
  const before = d.photos.filter((p) => p.kind === "before");
  const after = d.photos.filter((p) => p.kind === "after");
  const informed = d.stockRows.filter((r) => r.entry).length;
  const zero = d.stockRows.filter((r) => r.entry?.state === "zero").length;
  const pendencies: string[] = [];
  if (before.length < d.brand.minBeforePhotos) pendencies.push("Foto do antes ausente");
  if (after.length < d.brand.minAfterPhotos) pendencies.push("Foto do depois ausente");
  if (d.photos.some((p) => !p.uploadedAt)) pendencies.push("Foto(s) aguardando sincronização");
  if (informed < d.stockRows.length) pendencies.push(`${d.stockRows.length - informed} produto(s) sem informação de estoque`);
  if (a.status === "correction_requested") pendencies.push("Correção solicitada ao promotor");
  const ruptureImgs = d.photos.filter((p) => p.kind === "rupture" && images.has(p.id));

  return (
    <View break={breakBefore}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.canvas, borderLeftWidth: 3, borderLeftColor: C.accent, paddingVertical: 7, paddingHorizontal: 9, marginTop: 10 }} wrap={false}>
        <View>
          <Text style={{ fontSize: 12.5, fontFamily: "Helvetica-Bold", color: C.brand }}>{d.brand.name}</Text>
          <Text style={{ fontSize: 8.5, color: C.ink2, marginTop: 1 }}>
            {d.store.name} · {[d.chainName, d.store.city].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Pill tone={ATTENDANCE_STATUS_TONE[a.status] as PdfTone}>{ATTENDANCE_STATUS_LABEL[a.status]}</Pill>
          {a.reviewStatus !== "none" ? <Pill tone={a.reviewStatus === "approved" ? "success" : "danger"}>{REVIEW_STATUS_LABEL[a.reviewStatus]}</Pill> : null}
        </View>
      </View>
      <View style={{ marginTop: 6 }} wrap={false}>
        <InfoGrid
          items={[
            ["Promotor", d.promoterName],
            ["Data", fmtDate(d.visit.visitDate)],
            ["Início", fmtTime(a.startedAt)],
            ["Finalização", a.finishedAt ? fmtTime(a.finishedAt) : "—"],
            ["Duração", a.finishedAt ? fmtDuration(a.startedAt, a.finishedAt) : "—"],
            ["Estoque informado", `${informed}/${d.stockRows.length}`],
            ["Rupturas", String(d.ruptures.length)],
            ["Ocorrências", String(d.occurrences.length)],
          ]}
        />
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }} wrap={false}>
        <PhotoBox label="Antes" photo={before[0]} img={before[0] ? images.get(before[0].id) : undefined} />
        <PhotoBox label="Depois" photo={after[0]} img={after[0] ? images.get(after[0].id) : undefined} />
      </View>
      {before.length + after.length > 2 ? <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 3 }}>+{before.length + after.length - 2} foto(s) adicional(is) disponível(is) no sistema.</Text> : null}

      <Text style={base.h3}>Execução</Text>
      <Text style={{ fontSize: 8.5, color: C.ink2 }}>
        {d.brand.activities.length ? d.brand.activities.map((act) => `${act} (${a.activitiesDone.includes(act) ? "feito" : "não marcado"})`).join("  ·  ") : "Sem atividades cadastradas para a marca."}
      </Text>
      {a.notes ? <Text style={{ fontSize: 8.5, marginTop: 3 }}>Observação: “{a.notes}”</Text> : null}

      <Text style={base.h3}>Relatório de estoque {zero ? `· ${zero} com estoque zero` : ""}</Text>
      <PdfTable
        cols={[
          { label: "Produto", width: "44%", render: (r: Detail["stockRows"][number]) => `${r.product.name} (SKU ${r.product.sku})` },
          {
            label: "Situação",
            width: "26%",
            render: (r) => {
              const st: StockDisplayState = r.entry ? r.entry.state : "pending";
              return <Pill tone={STOCK_STATE_TONE[st] as PdfTone}>{STOCK_STATE_LABEL[st]}</Pill>;
            },
          },
          { label: "Quantidade", width: "13%", align: "right", render: (r) => (r.entry && r.entry.quantity !== null ? `${r.entry.quantity} ${r.entry.unit}` : "—") },
          { label: "Obs.", width: "17%", render: (r) => r.entry?.note ?? "" },
        ]}
        rows={d.stockRows}
        empty="Nenhum produto acompanhado."
      />
      <Text style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>Quantidades levantadas pelo promotor; não representam o saldo oficial da loja.</Text>
      {d.unregistered.length ? <Text style={{ fontSize: 8, marginTop: 3 }}>Fora do cadastro: {d.unregistered.map((u) => `${u.description}${u.quantity !== null ? ` (${u.quantity})` : ""}`).join("; ")}</Text> : null}

      <Text style={base.h3}>Produtos com ruptura</Text>
      <PdfTable
        cols={[
          { label: "Produto", width: "38%", render: (r: Detail["ruptures"][number]) => `${r.productName} (SKU ${r.sku})` },
          { label: "Situação", width: "30%", render: (r) => RUPTURE_SITUATION_LABEL[r.rupture.situation] },
          { label: "Estoque", width: "10%", align: "right", render: (r) => (r.rupture.knownStock ?? "—") as number | string },
          { label: "Status", width: "22%", render: (r) => <Pill tone={RUPTURE_STATUS_TONE[r.rupture.status] as PdfTone}>{RUPTURE_STATUS_LABEL[r.rupture.status]}</Pill> },
        ]}
        rows={d.ruptures}
        empty="Nenhuma ruptura registrada."
      />
      {ruptureImgs.length ? (
        <View style={{ flexDirection: "row", gap: 6, marginTop: 5 }} wrap={false}>
          {ruptureImgs.slice(0, 4).map((p) => (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image key={p.id} src={images.get(p.id)!} style={{ width: 110, height: 82, objectFit: "cover", borderRadius: 3 }} />
          ))}
        </View>
      ) : null}

      <Text style={base.h3}>Observações e ocorrências</Text>
      {d.occurrences.length ? (
        d.occurrences.map((o) => (
          <Text key={o.id} style={{ fontSize: 8.5, marginBottom: 2 }}>
            • {OCCURRENCE_CATEGORY_LABEL[o.category]}
            {o.note ? ` — “${o.note}”` : ""} ({OCCURRENCE_STATUS_LABEL[o.status]})
          </Text>
        ))
      ) : (
        <Text style={base.empty}>Nenhuma ocorrência registrada.</Text>
      )}

      <Text style={base.h3}>Pendências e exceções</Text>
      {a.exceptionItems.length ? (
        <Text style={{ fontSize: 8.5, color: C.warn }}>
          Exceção justificada: {a.exceptionItems.map((i) => EXCEPTION_ITEM_LABEL[i]).join(", ")} — {a.exceptionReason ? EXCEPTION_REASON_LABEL[a.exceptionReason] : ""}: “{a.exceptionNote}”
        </Text>
      ) : null}
      {a.status === "cancelled" ? <Text style={{ fontSize: 8.5, color: C.warn }}>Atendimento cancelado: “{a.cancelReason}”</Text> : null}
      {pendencies.length ? pendencies.map((p) => <Text key={p} style={{ fontSize: 8.5, color: C.bad }}>• {p}</Text>) : !a.exceptionItems.length ? <Text style={base.empty}>Nenhuma pendência.</Text> : null}
    </View>
  );
}

export async function renderAttendancesPdf(opts: { agency: PdfAgency; title: string; subtitle: string; blocks: AttendanceBlockData[]; summary?: { label: string; value: string | number; tone?: PdfTone }[]; footer: string; intro?: string }) {
  const generated = fmtDateTime(new Date());
  return renderToBuffer(
    <Document title={opts.title} author={opts.agency.name} creator="MCX">
      <Page size="A4" style={base.page}>
        <Header agency={opts.agency} title={opts.title} subtitle={opts.subtitle} right={`Gerado em ${generated}`} />
        <View style={base.body}>
          {opts.summary ? (
            <View style={{ marginTop: 6, marginBottom: 4 }}>
              <StatBoxes items={opts.summary} />
            </View>
          ) : null}
          {opts.intro ? <Text style={{ fontSize: 8.5, color: C.ink2, marginTop: 6 }}>{opts.intro}</Text> : null}
          {opts.blocks.length ? opts.blocks.map((b, i) => <AttendanceBlock key={b.d.attendance.id} data={b} breakBefore={i > 0} />) : <H2>Nenhum atendimento no período</H2>}
        </View>
        <Footer left={opts.footer} />
      </Page>
    </Document>,
  );
}
