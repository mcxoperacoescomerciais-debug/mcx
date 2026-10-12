/**
 * Gera imagens PNG simples para o banco de DEMONSTRAÇÃO (sem dependências).
 * "Antes" = faixas desalinhadas; "depois" = faixas organizadas. Servem só para
 * a galeria e o PDF terem o que mostrar em desenvolvimento — nunca em produção.
 */
import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

type RGB = [number, number, number];

export function demoShelfPng(width: number, height: number, kind: "before" | "after" | "rupture", seed: number): Uint8Array {
  const palette: RGB[] = [
    [196, 120, 64],
    [214, 172, 92],
    [120, 72, 48],
    [232, 214, 178],
    [168, 52, 52],
    [92, 120, 88],
  ];
  const shelfRows = 4;
  const rowH = Math.floor(height / shelfRows);
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let rnd = seed || 1;
  const rand = () => {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
    return rnd / 0x7fffffff;
  };
  // Largura dos "produtos" em cada prateleira.
  const layout: { x: number; w: number; c: RGB; h: number }[][] = [];
  for (let r = 0; r < shelfRows; r++) {
    const items: { x: number; w: number; c: RGB; h: number }[] = [];
    let x = 6;
    while (x < width - 6) {
      const w = kind === "after" ? 34 : 18 + Math.floor(rand() * 40);
      const gap = kind === "after" ? 4 : Math.floor(rand() * 26);
      const empty = kind === "rupture" ? rand() < 0.45 : kind === "before" ? rand() < 0.18 : false;
      if (!empty) {
        const c = kind === "after" ? palette[r % palette.length] : palette[Math.floor(rand() * palette.length)];
        items.push({ x, w, c, h: kind === "after" ? rowH - 22 : rowH - 22 - Math.floor(rand() * 30) });
      }
      x += w + gap;
    }
    layout.push(items);
  }
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    const r = Math.min(shelfRows - 1, Math.floor(y / rowH));
    const yInRow = y - r * rowH;
    for (let x = 0; x < width; x++) {
      let px: RGB = [238, 236, 230];
      if (yInRow >= rowH - 10) px = [150, 156, 166];
      else {
        const item = layout[r].find((it) => x >= it.x && x < it.x + it.w);
        if (item && yInRow >= rowH - 10 - item.h) px = item.c;
      }
      const o = rowStart + 1 + x * 3;
      raw[o] = px[0];
      raw[o + 1] = px[1];
      raw[o + 2] = px[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return new Uint8Array(
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]),
  );
}
