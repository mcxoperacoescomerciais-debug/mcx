/** Book de Atendimento: PDF e PowerPoint saem dos mesmos dados. */
process.env.UPLOADS_DIR ??= ".data/test-uploads";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { BookData } from "../src/server/pdf/book-pdf";

// JPEG 1×1 válido (para a foto não sair "indisponível").
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

const data: BookData = {
  brandName: "Suinco",
  from: "2026-10-19",
  to: "2026-10-19",
  total: 1,
  photos: 5,
  promoters: 1,
  attendances: [
    {
      id: "a1",
      date: "2026-10-19",
      brandName: "Suinco",
      storeName: "BH LJ 172 PITANGUI",
      address: "Pitangui - MG",
      cnpj: null,
      city: "Pitangui",
      promoterName: "Aderlania",
      finishedAt: new Date(),
      photos: [
        { id: "p1", kind: "before", placement: "extra_point", takenAt: new Date(), img: { data: JPEG, format: "jpg" } },
        { id: "p2", kind: "after", placement: "island", takenAt: new Date(), img: { data: JPEG, format: "jpg" } },
        { id: "p3", kind: "after", placement: null, takenAt: new Date(), img: null },
        { id: "p4", kind: "after", placement: "cross", takenAt: new Date(), img: { data: JPEG, format: "jpg" } },
        { id: "p5", kind: "after", placement: "natural_point", takenAt: new Date(), img: { data: JPEG, format: "jpg" } },
      ],
    },
  ],
};

describe("book de atendimento", () => {
  test("PowerPoint: arquivo .pptx válido com capa e slides das fotos", async () => {
    const { renderBookPptx } = await import("../src/server/pdf/book-pptx");
    const buf = await renderBookPptx({ name: "AF Merchandising", logo: null }, data);
    assert.equal(buf.subarray(0, 2).toString(), "PK", "pptx é um zip");
    const text = buf.toString("latin1");
    assert.ok(text.includes("ppt/slides/slide1.xml"));
    assert.ok(text.includes("ppt/slides/slide3.xml"), "5 fotos = 2 slides do atendimento + capa");
  });
});
