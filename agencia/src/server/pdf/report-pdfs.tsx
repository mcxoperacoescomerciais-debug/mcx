/** PDFs consolidados: relatório diário da operação e relatório por marca. */
import "server-only";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { C, Footer, H2, Header, Pill, PdfTable, StatBoxes, base, type PdfTone } from "./kit";
import type { DailyReport } from "../reports";
import type { brandReport } from "../reports";
import { PROMOTER_STATUS_LABEL, PROMOTER_STATUS_TONE } from "../operations";
import { ISSUE_KIND_LABEL, OCCURRENCE_CATEGORY_LABEL, RUPTURE_SITUATION_LABEL, RUPTURE_STATUS_LABEL, RUPTURE_STATUS_TONE, STOCK_STATE_LABEL, STOP_BUCKET_LABEL, STOP_BUCKET_TONE, STOP_BUCKETS } from "@/lib/domain";
import { fmtDate, fmtDateTime, fmtLongDate, fmtTime } from "@/lib/dates";
import { pct } from "@/lib/rules";

export async function renderDailyPdf(agency: string, r: DailyReport, filtersNote: string) {
  const k = r.board.kpis;
  const generated = fmtDateTime(new Date());
  type Stop = DailyReport["board"]["stops"][number];
  return renderToBuffer(
    <Document title={`Relatório diário ${r.board.date}`} author={agency} creator="MCX Campo">
      <Page size="A4" orientation="landscape" style={base.page}>
        <Header agency={agency} title="Relatório diário da operação" subtitle={`${fmtLongDate(r.board.date)}${filtersNote ? ` · ${filtersNote}` : ""}`} right={`Gerado em ${generated}`} />
        <View style={base.body}>
          <View style={{ marginTop: 6 }}>
            <StatBoxes
              items={[
                { label: "Lojas programadas", value: k.storesScheduled },
                { label: `Lojas concluídas (${pct(k.storesCompleted, k.storesScheduled) ?? "—"}%)`, value: k.storesCompleted, tone: "success" },
                { label: "Em andamento", value: k.visitsInProgress, tone: "info" },
                { label: "Pendentes / atrasadas", value: k.storesPendingOrLate, tone: k.storesLate ? "danger" : "neutral" },
                { label: `Marcas atendidas de ${k.attendancesPlanned}`, value: k.attendancesCompleted },
                { label: "Produtos com ruptura", value: k.ruptureProducts, tone: k.ruptureProducts ? "danger" : "neutral" },
                { label: "Pendências", value: r.issues.length, tone: r.issues.length ? "warning" : "success" },
              ]}
            />
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            {STOP_BUCKETS.map((b) => (
              <View key={b} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Pill tone={STOP_BUCKET_TONE[b] as PdfTone}>{`${STOP_BUCKET_LABEL[b]}: ${r.board.buckets[b]}`}</Pill>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 7, color: C.muted, marginTop: 3 }}>Cada loja programada é contada em um único grupo; a soma é o total de lojas do dia.</Text>

          <H2>Lojas programadas e visitas realizadas</H2>
          <PdfTable
            cols={[
              { label: "Loja", width: "24%", render: (st: Stop) => `${st.storeName}${st.scheduleId ? "" : " (extra)"}` },
              { label: "Cidade", width: "11%", render: (st) => st.city },
              { label: "Promotor", width: "14%", render: (st) => st.promoterName },
              { label: "Prev.", width: "6%", render: (st) => st.plannedStart ?? "—" },
              { label: "Início", width: "6%", render: (st) => (st.visit ? fmtTime(st.visit.startedAt) : "—") },
              { label: "Fim", width: "6%", render: (st) => (st.visit?.finishedAt ? fmtTime(st.visit.finishedAt) : "—") },
              { label: "Marcas", width: "17%", render: (st) => st.plannedBrands.map((b) => b.name).join(", ") },
              { label: "Feitas", width: "5%", align: "right", render: (st) => `${st.brandsDone}/${st.brandsTotal}` },
              { label: "Situação", width: "11%", render: (st) => <Pill tone={STOP_BUCKET_TONE[st.bucket] as PdfTone}>{STOP_BUCKET_LABEL[st.bucket]}</Pill> },
            ]}
            rows={r.board.stops}
            empty="Nenhuma loja programada."
          />

          <H2>Atendimentos por marca</H2>
          <PdfTable
            cols={[
              { label: "Marca", width: "30%", render: (b: DailyReport["byBrand"][number]) => b.brand },
              { label: "Previstos", width: "12%", align: "right", render: (b) => b.planned },
              { label: "Concluídos", width: "12%", align: "right", render: (b) => b.completed },
              { label: "Em andamento", width: "12%", align: "right", render: (b) => b.inProgress },
              { label: "Em correção", width: "12%", align: "right", render: (b) => b.correction },
              { label: "Cancelados", width: "11%", align: "right", render: (b) => b.cancelled },
              { label: "Não iniciados", width: "11%", align: "right", render: (b) => b.pending },
            ]}
            rows={r.byBrand}
          />

          <H2>Promotores</H2>
          <PdfTable
            cols={[
              { label: "Promotor", width: "28%", render: (p: DailyReport["promoters"][number]) => p.name },
              { label: "Programadas", width: "12%", align: "right", render: (p) => p.scheduled },
              { label: "Iniciadas", width: "10%", align: "right", render: (p) => p.started },
              { label: "Concluídas", width: "10%", align: "right", render: (p) => p.completed },
              { label: "Marcas", width: "10%", align: "right", render: (p) => `${p.attendancesDone}/${p.attendancesTotal}` },
              { label: "Último registro", width: "15%", render: (p) => (p.lastActivity ? fmtTime(p.lastActivity) : "—") },
              { label: "Situação", width: "15%", render: (p) => <Pill tone={PROMOTER_STATUS_TONE[p.status] as PdfTone}>{PROMOTER_STATUS_LABEL[p.status]}</Pill> },
            ]}
            rows={r.promoters}
          />

          <H2>{`Rupturas registradas (${r.ruptures.length})`}</H2>
          <PdfTable
            cols={[
              { label: "Loja", width: "22%", render: (x: DailyReport["ruptures"][number]) => x.storeName },
              { label: "Marca", width: "12%", render: (x) => x.brandName },
              { label: "Produto", width: "26%", render: (x) => `${x.productName} (${x.sku})` },
              { label: "Situação", width: "22%", render: (x) => RUPTURE_SITUATION_LABEL[x.situation] },
              { label: "Status", width: "18%", render: (x) => <Pill tone={RUPTURE_STATUS_TONE[x.status] as PdfTone}>{RUPTURE_STATUS_LABEL[x.status]}</Pill> },
            ]}
            rows={r.ruptures}
            empty="Nenhuma ruptura registrada no dia."
          />

          <H2>{`Estoque informado: produtos com estoque zero (${r.zeroStock.length})`}</H2>
          <PdfTable
            cols={[
              { label: "Loja", width: "30%", render: (z: DailyReport["zeroStock"][number]) => z.store_name },
              { label: "Marca", width: "15%", render: (z) => z.brand_name },
              { label: "Produto", width: "40%", render: (z) => `${z.product_name} (${z.sku})` },
              { label: "Situação", width: "15%", render: (z) => STOCK_STATE_LABEL[z.state] },
            ]}
            rows={r.zeroStock}
            empty="Nenhum produto com estoque zero informado."
          />

          <H2>{`Pendências (${r.issues.length})`}</H2>
          <PdfTable
            cols={[
              { label: "Tipo", width: "18%", render: (i: DailyReport["issues"][number]) => ISSUE_KIND_LABEL[i.kind] },
              { label: "Descrição", width: "38%", render: (i) => `${i.title} — ${i.detail}` },
              { label: "Loja", width: "18%", render: (i) => i.storeName },
              { label: "Marca", width: "10%", render: (i) => i.brandName ?? "—" },
              { label: "Análise", width: "16%", render: (i) => (i.review ? `${i.review.userName}: ${i.review.action}` : "Não analisada") },
            ]}
            rows={r.issues}
            empty="Nenhuma pendência."
          />

          <H2>{`Ocorrências (${r.occurrences.length})`}</H2>
          <PdfTable
            cols={[
              { label: "Loja", width: "25%", render: (o: DailyReport["occurrences"][number]) => o.storeName },
              { label: "Marca", width: "12%", render: (o) => o.brandName },
              { label: "Categoria", width: "25%", render: (o) => OCCURRENCE_CATEGORY_LABEL[o.category] },
              { label: "Observação", width: "38%", render: (o) => o.note ?? "" },
            ]}
            rows={r.occurrences}
            empty="Nenhuma ocorrência registrada."
          />
        </View>
        <Footer left={`${agency} · relatório diário ${fmtDate(r.board.date)}`} />
      </Page>
    </Document>,
  );
}

type BrandData = Awaited<ReturnType<typeof brandReport>>;

export async function renderBrandPdf(agency: string, r: BrandData, from: string, to: string) {
  const generated = fmtDateTime(new Date());
  const completed = r.attendances.filter((a) => a.status === "completed").length;
  return renderToBuffer(
    <Document title={`Relatório ${r.brand.name}`} author={agency} creator="MCX Campo">
      <Page size="A4" style={base.page}>
        <Header agency={agency} title={`Relatório da marca · ${r.brand.name}`} subtitle={`${fmtDate(from)} a ${fmtDate(to)}`} right={`Gerado em ${generated}`} />
        <View style={base.body}>
          <View style={{ marginTop: 6 }}>
            <StatBoxes
              items={[
                { label: "Atendimentos", value: r.attendances.length },
                { label: "Concluídos", value: completed, tone: "success" },
                { label: "Lojas atendidas", value: r.byStore.length },
                { label: "Rupturas", value: r.ruptures.length, tone: r.ruptures.length ? "danger" : "neutral" },
              ]}
            />
          </View>
          <H2>Por loja</H2>
          <PdfTable
            cols={[
              { label: "Loja", width: "34%", render: (x: BrandData["byStore"][number]) => x.store },
              { label: "Cidade", width: "16%", render: (x) => x.city },
              { label: "Atend.", width: "10%", align: "right", render: (x) => x.visits },
              { label: "Concluídos", width: "12%", align: "right", render: (x) => x.completed },
              { label: "Exceções", width: "10%", align: "right", render: (x) => x.exceptions },
              { label: "Rupturas", width: "9%", align: "right", render: (x) => x.ruptures },
              { label: "Último", width: "9%", render: (x) => fmtDate(x.last).slice(0, 5) },
            ]}
            rows={r.byStore}
            empty="Nenhum atendimento no período."
          />
          <H2>Por produto (último levantamento de cada loja)</H2>
          <PdfTable
            cols={[
              { label: "Produto", width: "40%", render: (x: BrandData["byProduct"][number]) => `${x.product} (${x.sku})` },
              { label: "Lojas c/ registro", width: "14%", align: "right", render: (x) => x.stores },
              { label: "Qtd. somada", width: "12%", align: "right", render: (x) => x.quantity },
              { label: "Estoque zero", width: "12%", align: "right", render: (x) => x.zero },
              { label: "Não encontrado", width: "12%", align: "right", render: (x) => x.notFound },
              { label: "Rupturas", width: "10%", align: "right", render: (x) => x.ruptures },
            ]}
            rows={r.byProduct}
            empty="Nenhum registro de estoque no período."
          />
          <Text style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>Quantidades levantadas pelos promotores; não representam saldo oficial das lojas.</Text>
          <H2>{`Rupturas (${r.ruptures.length})`}</H2>
          <PdfTable
            cols={[
              { label: "Data", width: "10%", render: (x: BrandData["ruptures"][number]) => fmtDate(x.visitDate).slice(0, 5) },
              { label: "Loja", width: "26%", render: (x) => x.storeName },
              { label: "Produto", width: "30%", render: (x) => x.productName },
              { label: "Situação", width: "18%", render: (x) => RUPTURE_SITUATION_LABEL[x.situation] },
              { label: "Status", width: "16%", render: (x) => <Pill tone={RUPTURE_STATUS_TONE[x.status] as PdfTone}>{RUPTURE_STATUS_LABEL[x.status]}</Pill> },
            ]}
            rows={r.ruptures}
            empty="Nenhuma ruptura no período."
          />
        </View>
        <Footer left={`${agency} · ${r.brand.name}`} />
      </Page>
    </Document>,
  );
}
