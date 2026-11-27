/**
 * Fotos ILUSTRATIVAS da demonstração do modo ações: um ponto de degustação desenhado
 * (gôndolas ao fundo, mesa com toalha na cor da marca, banner, promotora e clientes).
 * Sem texto e sem marca real — servem para o relatório e as telas terem o que mostrar.
 * Montagem = mesa com caixas fechadas; ação = clientes provando; encerramento = mesa vazia.
 */
import "server-only";

export type DemoShotKind = "before" | "after" | "closing";

const W = 1200;
const H = 900;

function rng(seed: number) {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10_000) / 10_000;
  };
}

const SKIN = ["#F1C9A5", "#E0AC84", "#C68863", "#8D5A3C", "#5C3A26"];
const SHIRTS = ["#3A6EA5", "#B23A48", "#4F7942", "#7A5C99", "#D98E04", "#2F4F4F", "#C0587E", "#6B8E23"];

function person(x: number, y: number, scale: number, skin: string, shirt: string, apron?: string) {
  const s = scale;
  return `
  <g transform="translate(${x},${y}) scale(${s})">
    <rect x="-34" y="60" width="68" height="150" rx="28" fill="${shirt}"/>
    ${apron ? `<rect x="-26" y="92" width="52" height="110" rx="8" fill="${apron}"/><rect x="-26" y="92" width="52" height="12" fill="#ffffff" opacity="0.35"/>` : ""}
    <rect x="-50" y="70" width="18" height="110" rx="9" fill="${shirt}"/>
    <rect x="32" y="70" width="18" height="110" rx="9" fill="${shirt}"/>
    <circle cx="0" cy="30" r="32" fill="${skin}"/>
    <path d="M-32 26 Q0 -14 32 26 Q22 4 0 2 Q-22 4 -32 26Z" fill="#3B2A20"/>
  </g>`;
}

function shelves(r: () => number) {
  let out = `<rect x="0" y="0" width="${W}" height="${H * 0.62}" fill="#EDEBE6"/>`;
  for (let row = 0; row < 4; row++) {
    const y = 40 + row * 120;
    out += `<rect x="0" y="${y + 96}" width="${W}" height="10" fill="#B9B4AA"/>`;
    for (let x = 10; x < W; x += 26 + Math.floor(r() * 18)) {
      const h = 50 + Math.floor(r() * 40);
      const c = SHIRTS[Math.floor(r() * SHIRTS.length)];
      out += `<rect x="${x}" y="${y + 96 - h}" width="${18 + Math.floor(r() * 10)}" height="${h}" rx="3" fill="${c}" opacity="${0.45 + r() * 0.4}"/>`;
    }
  }
  return out;
}

/** SVG da cena (convertido para JPEG pelo sharp). */
export function demoShotSvg(brandColor: string, kind: DemoShotKind, variant: number): string {
  const r = rng(variant * 7919 + kind.length * 131 + brandColor.charCodeAt(1));
  const tableX = 330 + Math.floor(r() * 80);
  const tableY = 560;
  let scene = shelves(r);
  // Piso
  scene += `<rect x="0" y="${H * 0.62}" width="${W}" height="${H * 0.38}" fill="#D9D5CC"/>`;
  for (let i = 0; i < 8; i++) scene += `<rect x="${i * 160}" y="${H * 0.62}" width="2" height="${H * 0.38}" fill="#C9C4BA"/>`;
  // Banner (roll-up)
  const bx = tableX + 470;
  const bh = kind === "closing" ? 220 : 420;
  scene += `<rect x="${bx}" y="${tableY + 160 - bh}" width="150" height="${bh}" rx="6" fill="${brandColor}"/>
    <circle cx="${bx + 75}" cy="${tableY + 160 - bh + 80}" r="44" fill="#ffffff" opacity="0.9"/>
    <circle cx="${bx + 75}" cy="${tableY + 160 - bh + 80}" r="26" fill="${brandColor}"/>
    ${kind === "closing" ? "" : `<rect x="${bx + 22}" y="${tableY + 160 - bh + 160}" width="106" height="14" rx="7" fill="#ffffff" opacity="0.85"/><rect x="${bx + 34}" y="${tableY + 160 - bh + 186}" width="82" height="10" rx="5" fill="#ffffff" opacity="0.6"/>`}
    <rect x="${bx + 55}" y="${tableY + 160}" width="40" height="12" fill="#555"/>`;
  // Promotora atrás da mesa
  if (kind !== "closing" || r() < 0.6) scene += person(tableX + 200, tableY - 210, 1.05, SKIN[Math.floor(r() * SKIN.length)], "#222222", brandColor);
  // Mesa com toalha
  scene += `<rect x="${tableX}" y="${tableY}" width="420" height="170" rx="6" fill="${brandColor}"/>
    <rect x="${tableX}" y="${tableY}" width="420" height="26" fill="#ffffff" opacity="0.25"/>
    <circle cx="${tableX + 210}" cy="${tableY + 98}" r="38" fill="#ffffff" opacity="0.9"/>
    <circle cx="${tableX + 210}" cy="${tableY + 98}" r="22" fill="${brandColor}"/>`;
  // Itens sobre a mesa
  if (kind === "before") {
    for (let i = 0; i < 4; i++) scene += `<rect x="${tableX + 30 + i * 90}" y="${tableY - 60}" width="70" height="60" rx="4" fill="#C8A26B"/><rect x="${tableX + 30 + i * 90}" y="${tableY - 34}" width="70" height="6" fill="#A9844F"/>`;
  } else if (kind === "after") {
    for (let i = 0; i < 3; i++) scene += `<rect x="${tableX + 30 + i * 40}" y="${tableY - 70}" width="30" height="70" rx="5" fill="${brandColor}"/><rect x="${tableX + 30 + i * 40}" y="${tableY - 50}" width="30" height="18" fill="#ffffff" opacity="0.8"/>`;
    for (let i = 0; i < 7; i++) scene += `<path d="M${tableX + 190 + i * 30} ${tableY - 4} l4 -26 h16 l4 26z" fill="#ffffff" stroke="#cccccc"/>`;
    scene += `<ellipse cx="${tableX + 330}" cy="${tableY - 6}" rx="60" ry="10" fill="#bbbbbb"/>`;
  } else {
    for (let i = 0; i < 2; i++) scene += `<rect x="${tableX + 60 + i * 120}" y="${tableY - 70}" width="90" height="70" rx="4" fill="#C8A26B"/>`;
  }
  // Clientes na frente (ação acontecendo)
  if (kind === "after") {
    const people = 2 + Math.floor(r() * 3);
    for (let i = 0; i < people; i++) {
      const x = 120 + i * 260 + Math.floor(r() * 60);
      if (Math.abs(x - (tableX + 210)) < 120 && i > 0) continue;
      scene += person(x, 470 + Math.floor(r() * 40), 1.35, SKIN[Math.floor(r() * SKIN.length)], SHIRTS[Math.floor(r() * SHIRTS.length)]);
    }
    scene += `<rect x="40" y="${tableY + 120}" width="120" height="80" rx="6" fill="#8C8C8C" opacity="0.7"/><circle cx="60" cy="${tableY + 210}" r="12" fill="#444"/><circle cx="140" cy="${tableY + 210}" r="12" fill="#444"/>`;
  }
  // Luz e leve vinheta (aspecto de foto)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="v" cx="50%" cy="45%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.28"/></radialGradient></defs>
  ${scene}
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#v)"/>
</svg>`;
}

/** JPEG da cena (e a miniatura). */
export async function demoShot(brandColor: string, kind: DemoShotKind, variant: number): Promise<{ full: Buffer; thumb: Buffer; width: number; height: number }> {
  const sharp = (await import("sharp")).default;
  const svg = Buffer.from(demoShotSvg(brandColor, kind, variant));
  const full = await sharp(svg).jpeg({ quality: 78 }).toBuffer();
  const thumb = await sharp(svg).resize({ width: 360 }).jpeg({ quality: 70 }).toBuffer();
  return { full, thumb, width: W, height: H };
}
