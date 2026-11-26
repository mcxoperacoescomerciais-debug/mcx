/** Relatórios com pouca memória: foto reduzida para o PDF e um relatório por vez. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { limiter, pdfSlot } from "../src/server/pdf/queue";
import { PDF_PHOTO_SIDE, shrinkForPdf } from "../src/server/pdf/shrink";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("fila: um relatório por vez, na ordem de chegada", async () => {
  const log: string[] = [];
  const job = (name: string, ms: number) =>
    pdfSlot(async () => {
      log.push(`início ${name}`);
      await sleep(ms);
      log.push(`fim ${name}`);
      return name;
    });
  const out = await Promise.all([job("a", 30), job("b", 5), job("c", 1)]);
  assert.deepEqual(out, ["a", "b", "c"]);
  assert.deepEqual(log, ["início a", "fim a", "início b", "fim b", "início c", "fim c"]);
});

test("fila: erro em um relatório não trava o próximo; relatório travado não segura a fila para sempre", async () => {
  await assert.rejects(pdfSlot(async () => Promise.reject(new Error("falhou"))));
  assert.equal(await pdfSlot(async () => "ok"), "ok");
  let free!: () => void;
  const stuck = pdfSlot(() => new Promise<string>((r) => (free = () => r("solto"))));
  const t0 = Date.now();
  assert.equal(await pdfSlot(async () => "passou", 40), "passou");
  assert.ok(Date.now() - t0 >= 35);
  free();
  assert.equal(await stuck, "solto");
});

test("downloads: no máximo 3 ao mesmo tempo", async () => {
  const run = limiter(3);
  let active = 0;
  let peak = 0;
  await Promise.all(
    Array.from({ length: 12 }, () =>
      run(async () => {
        peak = Math.max(peak, ++active);
        await sleep(3);
        active--;
      }),
    ),
  );
  assert.equal(peak, 3);
});

test("foto reduzida para o PDF: 1600 px vira 1100 px e fica menor; arquivo inválido volta como veio", async () => {
  const sharp = (await import("sharp")).default;
  const w = 1600;
  const h = 1200;
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 31 + (i >> 7) * 17) % 256;
  const big = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 82 }).toBuffer();
  const small = await shrinkForPdf(new Uint8Array(big), "image/jpeg");
  const meta = await sharp(small.data).metadata();
  assert.equal(small.format, "jpg");
  assert.equal(meta.width, PDF_PHOTO_SIDE);
  assert.equal(meta.height, 825);
  assert.ok(small.data.length < big.length);
  const junk = new Uint8Array([1, 2, 3, 4]);
  const same = await shrinkForPdf(junk, "image/jpeg");
  assert.deepEqual([...same.data], [1, 2, 3, 4]);
});
