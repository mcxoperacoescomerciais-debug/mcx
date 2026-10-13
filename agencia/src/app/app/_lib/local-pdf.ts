/**
 * PDF do atendimento gerado NO CELULAR, a partir do que está gravado no
 * aparelho — funciona sem internet. Quando o atendimento já está no servidor e
 * há sinal, o app usa o PDF oficial do servidor; este é o substituto offline
 * e diz isso no rodapé.
 */
import type { jsPDF as JsPdf } from "jspdf";
import {
  ATTENDANCE_STATUS_LABEL,
  DAMAGE_KIND_LABEL,
  OCCURRENCE_CATEGORY_LABEL,
  PHOTO_KIND_LABEL,
  STOCK_STATE_LABEL,
  UNIT_LABEL,
  VALIDITY_LOCATION_LABEL,
  type AttendanceDisplayStatus,
  type PhotoKind,
  type Unit,
} from "@/lib/domain";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/dates";
import type { BootstrapProduct } from "@/lib/sync-types";
import { getPhotoBlob, type LocalAttendance, type LocalPhoto } from "./local-store";

export interface LocalPdfInput {
  agency: string;
  promoter: string;
  brand: string;
  store: string;
  city: string;
  visitDate: string;
  status: AttendanceDisplayStatus;
  attendance: LocalAttendance;
  products: Map<string, BootstrapProduct>;
}

const BRAND = [12, 50, 58] as const;
const MUTED = [110, 116, 122] as const;
const unitShort = (u: string) => (UNIT_LABEL[u as Unit] ?? u).replace(/s$/, "").toLowerCase();

/** Foto para o PDF: original do aparelho, miniatura guardada ou cópia em cache do servidor. */
async function photoData(p: LocalPhoto): Promise<string | null> {
  let blob = (await getPhotoBlob(p.id)) ?? (await getPhotoBlob(p.id, true));
  if (!blob && p.uploaded) {
    blob = await fetch(`/api/photos/${p.id}?size=thumb`)
      .then((r) => (r.ok ? r.blob() : undefined))
      .catch(() => undefined);
  }
  if (!blob) return null;
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null);
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(blob);
  });
}

export async function buildLocalPdf(i: LocalPdfInput): Promise<File> {
  const { jsPDF } = await import("jspdf");
  const doc: JsPdf = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 14;
  let y = 0;
  const a = i.attendance;
  const productName = (id: string) => i.products.get(id)?.name ?? "Produto";

  const header = () => {
    doc.setFillColor(...BRAND);
    doc.rect(0, 0, W, 26, "F");
    doc.setTextColor(188, 218, 223);
    doc.setFontSize(8);
    doc.text(i.agency.toUpperCase(), M, 9);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Relatório de atendimento", M, 17);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${i.brand} · ${i.store}`, M, 22.5);
    y = 33;
  };
  const ensure = (h: number) => {
    if (y + h > 282) {
      doc.addPage();
      header();
    }
  };
  const h2 = (t: string) => {
    ensure(12);
    y += 3;
    doc.setTextColor(...BRAND);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(t, M, y);
    doc.setDrawColor(42, 132, 148);
    doc.line(M, y + 1.5, W - M, y + 1.5);
    doc.setFont("helvetica", "normal");
    y += 7;
  };
  const line = (t: string, opts: { muted?: boolean; size?: number } = {}) => {
    doc.setFontSize(opts.size ?? 9.5);
    if (opts.muted) doc.setTextColor(...MUTED);
    else doc.setTextColor(30, 33, 36);
    for (const part of doc.splitTextToSize(t, W - 2 * M) as string[]) {
      ensure(5);
      doc.text(part, M, y);
      y += 4.6;
    }
  };
  const table = (cols: { label: string; w: number }[], rows: string[][]) => {
    ensure(10);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    let x = M;
    for (const c of cols) {
      doc.text(c.label.toUpperCase(), x, y);
      x += c.w;
    }
    y += 4.5;
    doc.setFontSize(9);
    doc.setTextColor(30, 33, 36);
    for (const r of rows) {
      const wrapped = r.map((cell, k) => doc.splitTextToSize(cell, cols[k].w - 2) as string[]);
      const h = Math.max(...wrapped.map((w) => w.length)) * 4.3 + 1.5;
      ensure(h);
      x = M;
      wrapped.forEach((w, k) => {
        doc.text(w, x, y);
        x += cols[k].w;
      });
      y += h;
      doc.setDrawColor(230, 232, 235);
      doc.line(M, y - 2.6, W - M, y - 2.6);
    }
  };

  header();
  line(`Data: ${fmtDate(i.visitDate)}   ·   Loja: ${i.store} (${i.city})   ·   Promotor: ${i.promoter}`);
  line(`Situação: ${ATTENDANCE_STATUS_LABEL[i.status]}   ·   Início ${fmtTime(a.startedAt)}${a.finishedAt ? `   ·   Fim ${fmtTime(a.finishedAt)}` : ""}`);
  if (a.exceptionItems.length) line(`Finalizado com exceção: ${a.exceptionNote || "—"}`, { muted: true });

  if (a.activitiesDone.length) {
    h2("Execução");
    for (const act of a.activitiesDone) line(`• ${act}`);
  }

  // Fotos (antes, depois, demais), 3 por linha. Cada miniatura leva à foto ampliada no fim do PDF.
  const order = (k: string) => (k === "before" ? 0 : k === "after" ? 1 : 2);
  const photos = [...a.photos].sort((p, q) => order(p.kind) - order(q.kind));
  const thumbs: { page: number; x: number; y: number; w: number; h: number; data: string; p: LocalPhoto }[] = [];
  if (photos.length) {
    h2("Fotos · toque para ampliar");
    const size = (W - 2 * M - 8) / 3;
    let col = 0;
    for (const p of photos) {
      const data = await photoData(p);
      if (col === 0) ensure(size + 8);
      const x = M + col * (size + 4);
      if (data) {
        try {
          doc.addImage(data, "JPEG", x, y, size, size * 0.75, undefined, "FAST");
          thumbs.push({ page: doc.getNumberOfPages(), x, y, w: size, h: size * 0.75, data, p });
        } catch {
          doc.rect(x, y, size, size * 0.75);
        }
      } else {
        doc.setDrawColor(200, 200, 200);
        doc.rect(x, y, size, size * 0.75);
      }
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(`${PHOTO_KIND_LABEL[p.kind as PhotoKind] ?? p.kind} · ${fmtTime(p.takenAt)}`, x, y + size * 0.75 + 3.5);
      col++;
      if (col === 3) {
        col = 0;
        y += size * 0.75 + 7;
      }
    }
    if (col) y += size * 0.75 + 7;
  }

  const stock = Object.values(a.stock);
  if (stock.length) {
    h2("Estoque");
    table(
      [
        { label: "Produto", w: 110 },
        { label: "Situação", w: 45 },
        { label: "Qtd.", w: 27 },
      ],
      stock.map((s) => [productName(s.productId), STOCK_STATE_LABEL[s.state], s.state === "quantity" && s.quantity !== null ? `${s.quantity} ${unitShort(s.unit ?? i.products.get(s.productId)?.unit ?? "un")}` : "—"]),
    );
  }

  const ruptures = Object.values(a.ruptures);
  if (ruptures.length) {
    h2("Ruptura");
    table([{ label: "Produto", w: 182 }], ruptures.map((r) => [productName(r.productId)]));
  }

  const validities = Object.values(a.validities ?? {});
  if (validities.length) {
    h2("Validade");
    table(
      [
        { label: "Produto", w: 82 },
        { label: "Validade", w: 26 },
        { label: "Qtd.", w: 24 },
        { label: "Local", w: 30 },
        { label: "Lote", w: 20 },
      ],
      validities.map((v) => [productName(v.productId), fmtDate(v.expiryDate), `${v.quantity} ${unitShort(v.unit)}`, VALIDITY_LOCATION_LABEL[v.location], v.lot ?? "—"]),
    );
  }

  const damages = Object.values(a.damages ?? {});
  if (damages.length) {
    h2("Avaria");
    table(
      [
        { label: "Produto", w: 92 },
        { label: "Tipo", w: 60 },
        { label: "Qtd.", w: 30 },
      ],
      damages.map((d) => [productName(d.productId), DAMAGE_KIND_LABEL[d.kind], `${d.quantity} ${unitShort(d.unit)}`]),
    );
  }

  const occurrences = Object.values(a.occurrences);
  if (occurrences.length) {
    h2("Ocorrências");
    for (const o of occurrences) line(`• ${OCCURRENCE_CATEGORY_LABEL[o.category]}${o.note ? `: ${o.note}` : ""}`);
  }
  if (a.notes) {
    h2("Observações");
    line(a.notes);
  }

  // Fotos ampliadas (duas por página) e os links das miniaturas até elas.
  if (thumbs.length) {
    const fullW = W - 2 * M;
    const fullH = fullW * 0.75;
    thumbs.forEach((t, i) => {
      if (i % 2 === 0) {
        doc.addPage();
        header();
        y = 33;
      }
      doc.setFontSize(9);
      doc.setTextColor(30, 33, 36);
      doc.setFont("helvetica", "bold");
      doc.text(`${PHOTO_KIND_LABEL[t.p.kind as PhotoKind] ?? t.p.kind} · ${fmtDateTime(t.p.takenAt)}`, M, y);
      doc.setFont("helvetica", "normal");
      try {
        doc.addImage(t.data, "JPEG", M, y + 2, fullW, fullH, undefined, "FAST");
      } catch {
        doc.rect(M, y + 2, fullW, fullH);
      }
      const target = doc.getNumberOfPages();
      const here = y;
      doc.setPage(t.page);
      doc.link(t.x, t.y, t.w, t.h, { pageNumber: target });
      doc.setPage(target);
      y = here + fullH + 10;
    });
  }

  // Rodapé em todas as páginas.
  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Gerado no celular em ${fmtDateTime(new Date().toISOString())} · por MCX Operações Comerciais`, M, 291);
    doc.text(`Página ${n} de ${pages}`, W - M, 291, { align: "right" });
  }

  const safe = (v: string) => v.normalize("NFD").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "");
  return new File([doc.output("blob")], `Atendimento_${safe(i.brand)}_${safe(i.store)}_${i.visitDate}.pdf`, { type: "application/pdf" });
}
