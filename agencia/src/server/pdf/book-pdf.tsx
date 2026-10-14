/**
 * BOOK DE ATENDIMENTO — documento para o cliente (indústria): capa com a
 * identidade da agência, o período e os totais; depois, um bloco por
 * atendimento (loja, data, endereço, CNPJ, promotor, conclusão) com as fotos
 * de ANTES e PÓS REPOSIÇÃO, cada uma com o rodapé de identificação (loja,
 * cidade, data e hora, promotor). Segue os filtros do Relatório fotográfico.
 */
import "server-only";
import { Document, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb, schema as s } from "../db";
import type { Scope } from "../auth";
import { brandFilter, promoterFilter } from "../scope";
import { storage } from "../storage";
import { C, Footer, type PdfAgency } from "./kit";
import type { PanelFilters } from "@/lib/filters";
import { fmtDate, fmtDateTime } from "@/lib/dates";

/** Limites para o PDF caber na memória do servidor. */
export const BOOK_MAX_ATTENDANCES = 60;
const BOOK_MAX_PHOTOS = 160;
const PER_KIND = 4;

type Img = { data: Buffer; format: "png" | "jpg" };

export interface BookPhoto {
  id: string;
  kind: "before" | "after";
  takenAt: Date;
  img: Img | null;
}

export interface BookAttendance {
  id: string;
  date: string;
  brandName: string;
  storeName: string;
  address: string;
  cnpj: string | null;
  city: string;
  promoterName: string;
  finishedAt: Date | null;
  photos: BookPhoto[];
}

export interface BookData {
  brandName: string | null;
  from: string;
  to: string;
  attendances: BookAttendance[];
  /** Atendimentos no filtro (pode ser maior que o que coube no book). */
  total: number;
  photos: number;
  promoters: number;
}

export async function bookData(scope: Scope, f: PanelFilters): Promise<BookData> {
  const db = await getDb();
  const conds = and(
    eq(s.attendances.agencyId, scope.agencyId),
    gte(s.visits.visitDate, f.from),
    lte(s.visits.visitDate, f.to),
    inArray(s.attendances.status, ["completed", "correction_requested"]),
    brandFilter(scope, s.attendances.brandId),
    promoterFilter(scope, s.visits.promoterId),
    f.brand ? eq(s.attendances.brandId, f.brand) : undefined,
    f.store ? eq(s.visits.storeId, f.store) : undefined,
    f.promoter ? eq(s.visits.promoterId, f.promoter) : undefined,
    f.chain ? eq(s.stores.chainId, f.chain) : undefined,
    f.city ? eq(s.stores.city, f.city) : undefined,
    sql`exists (select 1 from ${s.photos} p where p.attendance_id = ${s.attendances.id} and p.kind in ('before','after') and p.deleted_at is null and p.uploaded_at is not null)`,
  );
  const rows = await db
    .select({
      id: s.attendances.id,
      date: s.visits.visitDate,
      brandName: s.brands.name,
      storeName: s.stores.name,
      street: s.stores.address,
      district: s.stores.district,
      city: s.stores.city,
      state: s.stores.state,
      cnpj: s.stores.cnpj,
      promoterName: s.users.name,
      promoterId: s.visits.promoterId,
      finishedAt: s.attendances.finishedAt,
      total: sql<number>`count(*) over()::int`,
    })
    .from(s.attendances)
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .where(conds)
    .orderBy(desc(s.visits.visitDate), asc(s.stores.name), asc(s.brands.name))
    .limit(BOOK_MAX_ATTENDANCES);

  const photoRows = rows.length
    ? await db
        .select({ id: s.photos.id, attendanceId: s.photos.attendanceId, kind: s.photos.kind, takenAt: s.photos.takenAt, storageKey: s.photos.storageKey, contentType: s.photos.contentType })
        .from(s.photos)
        .where(and(inArray(s.photos.attendanceId, rows.map((r) => r.id)), inArray(s.photos.kind, ["before", "after"]), isNull(s.photos.deletedAt), sql`${s.photos.uploadedAt} is not null`))
        .orderBy(asc(s.photos.takenAt))
    : [];

  // Uma por vez: o servidor gratuito tem pouca memória.
  let budget = BOOK_MAX_PHOTOS;
  const attendances: BookAttendance[] = [];
  for (const r of rows) {
    const mine = photoRows.filter((p) => p.attendanceId === r.id);
    const pick = [...mine.filter((p) => p.kind === "before").slice(0, PER_KIND), ...mine.filter((p) => p.kind === "after").slice(0, PER_KIND)];
    const photos: BookPhoto[] = [];
    for (const p of pick) {
      if (budget <= 0) break;
      const bytes = p.storageKey ? await storage().get(p.storageKey).catch(() => null) : null;
      budget--;
      photos.push({ id: p.id, kind: p.kind as "before" | "after", takenAt: p.takenAt, img: bytes ? { data: Buffer.from(bytes), format: p.contentType === "image/png" ? "png" : "jpg" } : null });
    }
    if (!photos.length) continue;
    attendances.push({
      id: r.id,
      date: r.date,
      brandName: r.brandName,
      storeName: r.storeName,
      address: [r.street, r.district, `${r.city} - ${r.state}`].filter(Boolean).join(", "),
      cnpj: r.cnpj,
      city: `${r.city} - ${r.state}`,
      promoterName: r.promoterName,
      finishedAt: r.finishedAt,
      photos,
    });
  }
  const brandName = f.brand ? (rows[0]?.brandName ?? (await db.select({ name: s.brands.name }).from(s.brands).where(eq(s.brands.id, f.brand)))[0]?.name ?? null) : null;
  return {
    brandName,
    from: f.from,
    to: f.to,
    attendances,
    total: rows[0]?.total ?? 0,
    photos: attendances.reduce((n, a) => n + a.photos.length, 0),
    promoters: new Set(rows.map((r) => r.promoterId)).size,
  };
}

const shortDate = (iso: string) => fmtDate(iso).replace(/\/(\d{2})(\d{2})$/, "/$2");

function Cover({ agency, data }: { agency: PdfAgency; data: BookData }) {
  const stat = (n: number, label: string) => (
    <View style={{ alignItems: "center", width: 120 }}>
      <Text style={{ color: "#FFFFFF", fontSize: 30, fontFamily: "Helvetica-Bold" }}>{n}</Text>
      <Text style={{ color: "#CFE5E8", fontSize: 7.5, letterSpacing: 2, marginTop: 4 }}>{label}</Text>
    </View>
  );
  return (
    <Page size="A4" style={{ backgroundColor: C.brand, fontFamily: "Helvetica", padding: 40 }}>
      <View style={{ position: "absolute", top: 0, right: 0, width: 260, height: 260, borderBottomLeftRadius: 260, backgroundColor: C.brand2 }} />
      <View style={{ position: "absolute", bottom: 0, left: 0, width: 200, height: 200, borderTopRightRadius: 200, backgroundColor: C.brand2 }} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        {agency.logo ? (
          <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", marginBottom: 26 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do PDF não tem alt */}
            <Image src={agency.logo} style={{ width: 70, height: 70, objectFit: "contain" }} />
          </View>
        ) : null}
        <Text style={{ color: "#FFFFFF", fontSize: 34, fontFamily: "Helvetica-Bold" }}>Book de Atendimento</Text>
        <View style={{ width: 50, height: 2, backgroundColor: "#7FB8C1", marginVertical: 18 }} />
        <Text style={{ color: "#E4F1F3", fontSize: 13, letterSpacing: 1 }}>
          {(data.brandName ?? "Todas as marcas").toUpperCase()} • {agency.name.toUpperCase()}
        </Text>
        <View style={{ marginTop: 18, borderWidth: 1, borderColor: "#5E9AA4", borderRadius: 6, paddingVertical: 7, paddingHorizontal: 16 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 11 }}>{data.from === data.to ? fmtDate(data.from) : `${shortDate(data.from)} - ${shortDate(data.to)}`}</Text>
        </View>
        <View style={{ flexDirection: "row", marginTop: 34 }}>
          {stat(data.attendances.length, "ATENDIMENTOS")}
          {stat(data.photos, "FOTOS")}
          {stat(data.promoters, "PROMOTORES")}
        </View>
      </View>
      <Text style={{ color: "#9CC3C9", fontSize: 8, textAlign: "center" }}>Gerado em {fmtDateTime(new Date())}</Text>
    </Page>
  );
}

/** Foto com o rodapé de identificação por cima (como a foto "carimbada" do celular). */
function StampedPhoto({ a, p }: { a: BookAttendance; p: BookPhoto }) {
  return (
    <View style={{ width: "48.5%", marginBottom: 10, borderWidth: 0.6, borderColor: C.line, borderRadius: 6, overflow: "hidden" }} wrap={false}>
      <View style={{ height: 205, backgroundColor: "#1B1F20" }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do PDF não tem alt */}
        {p.img ? <Image src={{ data: p.img.data, format: p.img.format }} style={{ width: "100%", height: 205, objectFit: "cover" }} /> : <Text style={{ color: "#FFFFFF", fontSize: 8, margin: 10 }}>Foto indisponível</Text>}
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)", paddingVertical: 4, paddingHorizontal: 6 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 7, fontFamily: "Helvetica-Bold" }}>{a.storeName.toUpperCase()}</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 6.5 }}>{a.city}</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 6.5 }}>{fmtDateTime(p.takenAt)}</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 6.5 }}>Promotor: {a.promoterName}</Text>
        </View>
      </View>
      <View style={{ paddingVertical: 6, paddingHorizontal: 8, backgroundColor: "#FAFAF8" }}>
        <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 1, color: p.kind === "before" ? C.warn : C.ok }}>{p.kind === "before" ? "ANTES DA REPOSIÇÃO" : "PÓS REPOSIÇÃO"}</Text>
      </View>
    </View>
  );
}

function AttendanceCard({ a, showBrand }: { a: BookAttendance; showBrand: boolean }) {
  // Até 4 fotos o bloco cabe numa página: não separa o cabeçalho das fotos.
  return (
    <View style={{ marginBottom: 14 }} wrap={a.photos.length > 4}>
      <View style={{ backgroundColor: C.brand2, borderTopLeftRadius: 8, borderTopRightRadius: 8, paddingVertical: 12, paddingHorizontal: 16 }} wrap={false} minPresenceAhead={260}>
        <Text style={{ color: "#FFFFFF", fontSize: 13, fontFamily: "Helvetica-Bold" }}>
          {a.storeName.toUpperCase()} · {fmtDate(a.date)}
        </Text>
        {showBrand ? <Text style={{ color: "#DCEFF2", fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 3 }}>{a.brandName}</Text> : null}
        <Text style={{ color: "#E4F1F3", fontSize: 8.5, marginTop: 5 }}>{a.address}</Text>
        {a.cnpj ? <Text style={{ color: "#E4F1F3", fontSize: 8.5, marginTop: 2 }}>CNPJ: {a.cnpj}</Text> : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 7 }}>
          <Text style={{ color: "#E4F1F3", fontSize: 8.5 }}>Promotor: {a.promoterName}</Text>
          {a.finishedAt ? <Text style={{ color: "#E4F1F3", fontSize: 8.5 }}>Concluído em: {fmtDateTime(a.finishedAt)}</Text> : null}
        </View>
      </View>
      <View style={{ borderWidth: 0.6, borderTopWidth: 0, borderColor: C.line, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, padding: 12, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
        {a.photos.map((p) => (
          <StampedPhoto key={p.id} a={a} p={p} />
        ))}
      </View>
    </View>
  );
}

export async function renderBookPdf(agency: PdfAgency, data: BookData) {
  const title = `Book de Atendimento - ${data.brandName ?? agency.name}`;
  return renderToBuffer(
    <Document title={title} author={agency.name} creator="MCX">
      <Cover agency={agency} data={data} />
      <Page size="A4" style={{ fontFamily: "Helvetica", fontSize: 9, color: C.ink, paddingTop: 28, paddingBottom: 46, paddingHorizontal: 28 }}>
        {data.attendances.length ? (
          data.attendances.map((a) => <AttendanceCard key={a.id} a={a} showBrand={!data.brandName} />)
        ) : (
          <Text style={{ fontSize: 11, color: C.muted, marginTop: 30, textAlign: "center" }}>Nenhum atendimento com fotos neste filtro.</Text>
        )}
        {data.total > data.attendances.length ? (
          <Text style={{ fontSize: 8, color: C.muted, marginTop: 8 }}>
            Este book mostra os {data.attendances.length} atendimentos mais recentes de {data.total}. Use um período ou filtro menor para ver os demais.
          </Text>
        ) : null}
        <Footer left={title} />
      </Page>
    </Document>,
  );
}
