/**
 * Relatório de ações para a MARCA (modo ações): o que a agência hoje monta à mão com as
 * fotos do WhatsApp depois de cada campanha. Blocos escolhidos na tela: resumo, resultado
 * por PDV, galeria de fotos por PDV, ocorrências, observações das promotoras e agenda.
 * Não mostra custos nem margem (é para o cliente da agência).
 */
import "server-only";
import { Document, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { C, Footer, H2, Header, PdfTable, StatBoxes, base, type PdfAgency } from "./kit";
import { loadPdfImage } from "./pdf-image";
import type { PdfImg } from "./shrink";
import { ACTION_STATE_LABEL, type ActionRecord, type ActionSummary } from "../actions-data";
import { ACCEPTANCE_LABEL, ACTION_PHOTO_LABEL, pct } from "@/lib/actions";
import { OCCURRENCE_CATEGORY_LABEL, type OccurrenceCategory } from "@/lib/domain";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/dates";

export const REPORT_BLOCKS = [
  { key: "resumo", label: "Resumo com os indicadores" },
  { key: "pdvs", label: "Resultado por PDV" },
  { key: "fotos", label: "Galeria de fotos por PDV" },
  { key: "ocorrencias", label: "Ocorrências" },
  { key: "observacoes", label: "Observações das promotoras" },
  { key: "agenda", label: "Agenda executada (todas as ações e situação)" },
] as const;
export type ReportBlock = (typeof REPORT_BLOCKS)[number]["key"];

/** Fotos no PDF: até 3 por ação (montagem, ação, encerramento) e no máximo 72 no relatório. */
const MAX_PHOTOS = 72;
const PHOTO_SIDE = 720;
const n = (v: number) => v.toLocaleString("pt-BR");

export interface BrandReportInput {
  agency: PdfAgency;
  brandName: string;
  from: string;
  to: string;
  campaign: string | null;
  intro: string | null;
  blocks: Set<ReportBlock>;
  actions: ActionRecord[];
  summary: ActionSummary;
  demo: boolean;
}

export async function renderBrandReport(i: BrandReportInput) {
  const realized = i.actions.filter((a) => a.state === "realized");
  // Galeria: por PDV, as ações mais recentes primeiro, até o limite de fotos.
  const images = new Map<string, PdfImg>();
  const gallery: { store: string; items: { a: ActionRecord; photos: { id: string; kind: string; takenAt: Date }[] }[] }[] = [];
  let omitted = 0;
  if (i.blocks.has("fotos")) {
    const byStore = new Map<string, ActionRecord[]>();
    for (const a of realized) if (a.photos.some((p) => p.uploaded)) byStore.set(`${a.storeName} · ${a.city}`, [...(byStore.get(`${a.storeName} · ${a.city}`) ?? []), a]);
    const stores = [...byStore.entries()].sort(([x], [y]) => x.localeCompare(y, "pt-BR"));
    // Reparte o limite entre os PDVs: cada um aparece, com pelo menos uma ação.
    const perStore = Math.max(1, Math.floor(MAX_PHOTOS / 3 / Math.max(1, stores.length)));
    let budget = MAX_PHOTOS;
    for (const [store, list] of stores) {
      const recent = [...list].sort((a, b) => b.date.localeCompare(a.date));
      const items: (typeof gallery)[number]["items"] = [];
      for (const a of recent) {
        if (items.length >= perStore || budget <= 0) {
          omitted++;
          continue;
        }
        const pick = (["before", "after", "closing"] as const).map((k) => a.photos.find((p) => p.kind === k && p.uploaded && p.storageKey)).filter((p): p is NonNullable<typeof p> => Boolean(p));
        budget -= pick.length;
        items.push({ a, photos: pick.map((p) => ({ id: p.id, kind: p.kind, takenAt: p.takenAt })) });
        await Promise.all(
          pick.map(async (p) => {
            const img = await loadPdfImage(p.storageKey, p.contentType, PHOTO_SIDE).catch(() => null);
            if (img) images.set(p.id, img);
          }),
        );
      }
      gallery.push({ store, items });
    }
  }

  const s = i.summary;
  const stores = new Set(realized.map((a) => a.storeId ?? a.storeName)).size;
  const promoters = new Set(realized.map((a) => a.promoterName).filter(Boolean)).size;
  const occurrences = realized.concat(i.actions.filter((a) => a.state === "not_done")).flatMap((a) => a.occurrences.map((o) => ({ a, o })));
  const notes = realized.filter((a) => a.notes?.trim());
  const period = `${fmtDate(i.from)} a ${fmtDate(i.to)}`;
  const footer = `${i.agency.name} · ${i.brandName} · ${period}${i.demo ? " · dados fictícios de demonstração" : ""}`;

  return renderToBuffer(
    <Document title={`Relatório de ações · ${i.brandName}`} author={i.agency.name} creator="MCX">
      <Page size="A4" style={base.page}>
        <Header agency={i.agency} title={`Relatório de ações · ${i.brandName}`} subtitle={`${period}${i.campaign ? ` · campanha ${i.campaign}` : ""}`} right={`Gerado em ${fmtDateTime(new Date())}`} />
        <View style={base.body}>
          {i.intro ? <Text style={{ fontSize: 9.5, color: C.ink2, marginTop: 8, lineHeight: 1.4 }}>{i.intro}</Text> : null}

          {i.blocks.has("resumo") ? (
            <View wrap={false}>
              <H2>Resumo da campanha</H2>
              <StatBoxes
                items={[
                  { label: "Ações realizadas", value: realized.length, tone: "success" },
                  { label: "PDVs atendidos", value: stores },
                  { label: "Promotoras", value: promoters },
                  { label: "Horas em ação", value: `${Math.round(s.operation.hours)} h` },
                ]}
              />
              <View style={{ height: 6 }} />
              <StatBoxes
                items={[
                  { label: "Pessoas abordadas", value: n(s.result.approached), tone: "info" },
                  { label: "Amostras distribuídas", value: n(s.result.samples), tone: "info" },
                  { label: "Unidades vendidas na ação", value: n(s.result.sold), tone: "info" },
                  { label: "Conversão (vendas ÷ abordagens)", value: pct(s.result.conversion), tone: "success" },
                ]}
              />
              <View style={{ height: 6 }} />
              <StatBoxes
                items={[
                  { label: "Aceitação média (1 a 5)", value: s.result.acceptance === null ? "—" : `${s.result.acceptance.toFixed(1).replace(".", ",")} · ${ACCEPTANCE_LABEL[Math.round(s.result.acceptance)]}` },
                  { label: "Pontualidade (check-in no horário)", value: pct(s.operation.onTime, 0) },
                  { label: "Ações com as 3 fotos", value: pct(s.quality.photosComplete, 0) },
                  { label: "Canceladas / não realizadas", value: `${s.operation.cancelled} / ${s.operation.notDone}`, tone: s.operation.cancelled + s.operation.notDone ? "warning" : "neutral" },
                ]}
              />
            </View>
          ) : null}

          {i.blocks.has("pdvs") ? (
            <View>
              <H2>Resultado por PDV</H2>
              <PdfTable
                cols={[
                  { label: "PDV", width: "34%", render: (r: ActionSummary["byStore"][number]) => r.name },
                  { label: "Ações", width: "9%", align: "right", render: (r) => String(r.actions) },
                  { label: "Abordagens", width: "13%", align: "right", render: (r) => n(r.approached) },
                  { label: "Amostras", width: "12%", align: "right", render: (r) => n(r.samples) },
                  { label: "Vendas", width: "10%", align: "right", render: (r) => n(r.sold) },
                  { label: "Conversão", width: "11%", align: "right", render: (r) => pct(r.conversion) },
                  { label: "Aceitação", width: "11%", align: "right", render: (r) => (r.acceptance === null ? "—" : r.acceptance.toFixed(1).replace(".", ",")) },
                ]}
                rows={s.byStore.filter((r) => r.actions > 0)}
                empty="Nenhuma ação realizada no período."
              />
            </View>
          ) : null}

          {i.blocks.has("fotos") ? (
            <View break={i.blocks.has("resumo") || i.blocks.has("pdvs")}>
              <H2>Galeria de fotos por PDV</H2>
              {gallery.length ? null : <Text style={base.empty}>Nenhuma foto enviada no período.</Text>}
              {gallery.map((g) => (
                <View key={g.store} style={{ marginBottom: 6 }}>
                  <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: C.brand, marginTop: 8, marginBottom: 4 }} minPresenceAhead={150}>
                    {g.store}
                  </Text>
                  {g.items.map(({ a, photos }) => (
                    <View key={a.key} wrap={false} style={{ marginBottom: 8 }}>
                      <Text style={{ fontSize: 8, color: C.ink2, marginBottom: 3 }}>
                        {fmtDate(a.date)} · {a.promoterName ?? "—"}
                        {a.outcome ? ` · ${n(a.outcome.approached ?? 0)} abordagens · ${n(a.outcome.samples ?? 0)} amostras · ${n(a.outcome.unitsSold ?? 0)} vendas` : ""}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        {photos.map((p) => {
                          const img = images.get(p.id);
                          return (
                            <View key={p.id} style={{ width: 172 }}>
                              {img ? (
                                // eslint-disable-next-line jsx-a11y/alt-text -- Image do PDF não tem alt
                                <Image src={img} style={{ width: 172, height: 129, objectFit: "cover", borderRadius: 3 }} />
                              ) : (
                                <View style={{ width: 172, height: 129, backgroundColor: C.canvas, borderRadius: 3 }} />
                              )}
                              <Text style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>
                                {ACTION_PHOTO_LABEL[p.kind as "before" | "after" | "closing"] ?? p.kind} · {fmtTime(p.takenAt)}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              ))}
              {omitted ? <Text style={{ fontSize: 8, color: C.muted, marginTop: 4 }}>{omitted} ação(ões) a mais com fotos no sistema (o relatório mostra as mais recentes de cada PDV).</Text> : null}
            </View>
          ) : null}

          {i.blocks.has("ocorrencias") ? (
            <View>
              <H2>Ocorrências</H2>
              <PdfTable
                cols={[
                  { label: "Data", width: "12%", render: (r: (typeof occurrences)[number]) => fmtDate(r.a.date) },
                  { label: "PDV", width: "30%", render: (r) => `${r.a.storeName} · ${r.a.city}` },
                  { label: "Tipo", width: "24%", render: (r) => OCCURRENCE_CATEGORY_LABEL[r.o.category as OccurrenceCategory] ?? r.o.category },
                  { label: "Observação da promotora", width: "34%", render: (r) => r.o.note ?? "—" },
                ]}
                rows={occurrences}
                empty="Nenhuma ocorrência registrada."
              />
            </View>
          ) : null}

          {i.blocks.has("observacoes") ? (
            <View>
              <H2>Observações das promotoras</H2>
              {notes.length ? (
                notes.map((a) => (
                  <View key={a.key} wrap={false} style={{ marginBottom: 6, padding: 6, backgroundColor: C.canvas, borderRadius: 3 }}>
                    <Text style={{ fontSize: 7.5, color: C.muted }}>
                      {fmtDate(a.date)} · {a.storeName} · {a.city} · {a.promoterName ?? "—"}
                    </Text>
                    <Text style={{ fontSize: 9, marginTop: 2 }}>“{a.notes}”</Text>
                  </View>
                ))
              ) : (
                <Text style={base.empty}>Nenhuma observação registrada.</Text>
              )}
            </View>
          ) : null}

          {i.blocks.has("agenda") ? (
            <View>
              <H2>Agenda executada</H2>
              <PdfTable
                cols={[
                  { label: "Data", width: "11%", render: (r: ActionRecord) => fmtDate(r.date) },
                  { label: "Horário", width: "11%", render: (r) => (r.checkIn ? `${fmtTime(r.checkIn)}–${r.checkOut ? fmtTime(r.checkOut) : "…"}` : r.plannedStart ? `${r.plannedStart}–${r.plannedEnd ?? ""}` : "—") },
                  { label: "PDV", width: "30%", render: (r) => `${r.storeName} · ${r.city}` },
                  { label: "Promotora", width: "18%", render: (r) => r.promoterName ?? "—" },
                  { label: "Situação", width: "30%", render: (r) => `${ACTION_STATE_LABEL[r.state]}${r.reason && (r.state === "cancelled" || r.state === "not_done") ? ` · ${r.reason}` : ""}` },
                ]}
                rows={i.actions.filter((a) => a.state !== "scheduled" && a.state !== "in_progress")}
                empty="Nenhuma ação no período."
              />
            </View>
          ) : null}
        </View>
        <Footer left={footer} />
      </Page>
    </Document>,
  );
}
