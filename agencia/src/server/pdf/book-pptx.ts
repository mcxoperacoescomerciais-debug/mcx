/**
 * Book de Atendimento em PowerPoint (mesmos dados do PDF): capa e, para cada
 * atendimento, um slide com até 4 fotos (antes/depois) e o rodapé de identificação.
 */
import "server-only";
import PptxGenJS from "pptxgenjs";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { withPlacement } from "@/lib/domain";
import type { BookAttendance, BookData, BookPhoto } from "./book-pdf";
import { C, type PdfAgency } from "./kit";

const hex = (c: string) => c.replace("#", "").toUpperCase();
const PER_SLIDE = 4;

function imgData(p: BookPhoto): string | null {
  if (!p.img) return null;
  return `image/${p.img.format === "png" ? "png" : "jpeg"};base64,${p.img.data.toString("base64")}`;
}

export async function renderBookPptx(agency: PdfAgency, data: BookData): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13,33 × 7,5 pol.
  pptx.author = agency.name;
  pptx.company = agency.name;
  pptx.title = `Book de Atendimento - ${data.brandName ?? agency.name}`;
  const W = 13.333;

  // Capa
  const cover = pptx.addSlide();
  cover.background = { color: hex(C.brand) };
  if (agency.logo) cover.addImage({ data: agency.logo.replace(/^data:/, ""), x: W / 2 - 0.6, y: 0.7, w: 1.2, h: 1.2, sizing: { type: "contain", w: 1.2, h: 1.2 } });
  cover.addText("Book de Atendimento", { x: 0, y: 2.1, w: W, h: 0.9, align: "center", fontSize: 40, bold: true, color: "FFFFFF", fontFace: "Arial" });
  cover.addText(`${(data.brandName ?? "Todas as marcas").toUpperCase()} • ${agency.name.toUpperCase()}`, { x: 0, y: 3.05, w: W, h: 0.5, align: "center", fontSize: 16, color: "E4F1F3", fontFace: "Arial" });
  cover.addText(data.from === data.to ? fmtDate(data.from) : `${fmtDate(data.from)} a ${fmtDate(data.to)}`, { x: 0, y: 3.65, w: W, h: 0.45, align: "center", fontSize: 14, color: "FFFFFF", fontFace: "Arial" });
  const stats: [number, string][] = [
    [data.attendances.length, "ATENDIMENTOS"],
    [data.photos, "FOTOS"],
    [data.promoters, "PROMOTORES"],
  ];
  stats.forEach(([n, label], i) => {
    const x = W / 2 - 4.5 + i * 3;
    cover.addText(String(n), { x, y: 4.6, w: 3, h: 0.8, align: "center", fontSize: 36, bold: true, color: "FFFFFF", fontFace: "Arial" });
    cover.addText(label, { x, y: 5.4, w: 3, h: 0.35, align: "center", fontSize: 11, color: "CFE5E8", charSpacing: 2, fontFace: "Arial" });
  });
  cover.addText(`Gerado em ${fmtDateTime(new Date())}`, { x: 0, y: 6.9, w: W, h: 0.3, align: "center", fontSize: 9, color: "9CC3C9", fontFace: "Arial" });

  if (!data.attendances.length) {
    const s = pptx.addSlide();
    s.addText("Nenhum atendimento com fotos neste filtro.", { x: 0, y: 3.4, w: W, h: 0.6, align: "center", fontSize: 18, color: hex(C.muted) });
  }
  for (const a of data.attendances) {
    for (let i = 0; i < Math.max(1, a.photos.length); i += PER_SLIDE) attendanceSlide(pptx, a, a.photos.slice(i, i + PER_SLIDE), !data.brandName, i > 0);
  }
  if (data.total > data.attendances.length) {
    const s = pptx.addSlide();
    s.addText(`Este book mostra os ${data.attendances.length} atendimentos mais recentes de ${data.total}. Use um período ou filtro menor para ver os demais.`, { x: 0.8, y: 3.2, w: W - 1.6, h: 1, align: "center", fontSize: 16, color: hex(C.muted) });
  }
  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}

function attendanceSlide(pptx: PptxGenJS, a: BookAttendance, photos: BookPhoto[], showBrand: boolean, continued: boolean) {
  const W = 13.333;
  const s = pptx.addSlide();
  s.background = { color: "FFFFFF" };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 1.15, fill: { color: hex(C.brand2) }, line: { color: hex(C.brand2) } });
  s.addText(`${a.storeName.toUpperCase()} · ${fmtDate(a.date)}${continued ? " (continuação)" : ""}`, { x: 0.4, y: 0.12, w: W - 0.8, h: 0.45, fontSize: 20, bold: true, color: "FFFFFF", fontFace: "Arial" });
  const line2 = [showBrand ? a.brandName : null, a.address, a.cnpj ? `CNPJ: ${a.cnpj}` : null].filter(Boolean).join("  ·  ");
  s.addText(line2, { x: 0.4, y: 0.55, w: W - 0.8, h: 0.3, fontSize: 11, color: "E4F1F3", fontFace: "Arial" });
  s.addText(`Promotor: ${a.promoterName}${a.finishedAt ? `  ·  Concluído em: ${fmtDateTime(a.finishedAt)}` : ""}`, { x: 0.4, y: 0.82, w: W - 0.8, h: 0.28, fontSize: 11, color: "E4F1F3", fontFace: "Arial" });

  // Grade: 4 fotos lado a lado (ou 2/3), com a legenda embaixo.
  const n = Math.max(1, photos.length);
  const gap = 0.25;
  const pw = (W - 0.8 - gap * (n - 1)) / n;
  const ph = Math.min(4.6, pw * 1.25);
  photos.forEach((p, i) => {
    const x = 0.4 + i * (pw + gap);
    const y = 1.45;
    const data = imgData(p);
    if (data) s.addImage({ data, x, y, w: pw, h: ph, sizing: { type: "cover", w: pw, h: ph } });
    else s.addText("Foto indisponível", { x, y, w: pw, h: ph, align: "center", fontSize: 12, color: "FFFFFF", fill: { color: "1B1F20" } });
    s.addShape(pptx.ShapeType.rect, { x, y: y + ph - 0.9, w: pw, h: 0.9, fill: { color: "000000", transparency: 45 }, line: { color: "000000", transparency: 100 } });
    s.addText(
      [
        { text: a.storeName.toUpperCase(), options: { bold: true, breakLine: true } },
        { text: a.city, options: { breakLine: true } },
        { text: fmtDateTime(p.takenAt), options: { breakLine: true } },
        { text: `Promotor: ${a.promoterName}` },
      ],
      { x: x + 0.08, y: y + ph - 0.88, w: pw - 0.16, h: 0.86, fontSize: 9, color: "FFFFFF", fontFace: "Arial", valign: "top" },
    );
    s.addText(withPlacement(p.kind === "before" ? "ANTES DA REPOSIÇÃO" : "PÓS REPOSIÇÃO", p.placement).toUpperCase(), {
      x,
      y: y + ph + 0.08,
      w: pw,
      h: 0.4,
      fontSize: 11,
      bold: true,
      charSpacing: 1,
      color: hex(p.kind === "before" ? C.warn : C.ok),
      fontFace: "Arial",
    });
  });
}
