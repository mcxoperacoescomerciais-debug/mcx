// Gera as variações da logo, os ícones e a imagem de compartilhamento a partir
// da logo oficial (public/mcx-logo.png). Rode de novo sempre que a logo mudar:
//   npm run icons
import sharp from "sharp";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const ORIGEM = "public/mcx-logo.png";
const NAVY = { r: 0, g: 13, b: 54 }; // fundo da logo (#000D36)

// Área útil da logo (letras + "Operações Comerciais") e só o monograma "MCX".
const AREA_COMPLETA = { left: 70, top: 108, width: 358, height: 300 };
const AREA_MONOGRAMA = { left: 70, top: 108, width: 358, height: 214 };

mkdirSync("public/brand", { recursive: true });
mkdirSync("src/app", { recursive: true });

/** Recorta a logo e troca o fundo azul por transparência, pintando o traço com `cor`. */
async function recorteTransparente(area, cor, largura) {
  const { data, info } = await sharp(ORIGEM)
    .extract(area)
    .resize({ width: largura })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const saida = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
    // Luminância relativa ao azul do fundo vira opacidade.
    const lum = (data[i] - NAVY.r + (data[i + 1] - NAVY.g) + (data[i + 2] - NAVY.b)) / 3;
    const alpha = Math.max(0, Math.min(255, Math.round((lum / 190) * 255)));
    saida[j] = cor.r;
    saida[j + 1] = cor.g;
    saida[j + 2] = cor.b;
    saida[j + 3] = alpha;
  }
  return sharp(saida, { raw: { width: info.width, height: info.height, channels: 4 } }).png();
}

const PRATA = { r: 228, g: 231, b: 229 };

await (await recorteTransparente(AREA_COMPLETA, PRATA, 480)).toFile("public/brand/logo-prata.png");
await (await recorteTransparente(AREA_COMPLETA, NAVY, 480)).toFile("public/brand/logo-navy.png");
await (await recorteTransparente(AREA_MONOGRAMA, NAVY, 240)).toFile("public/brand/monograma-navy.png");
await (await recorteTransparente(AREA_MONOGRAMA, PRATA, 240)).toFile("public/brand/monograma-prata.png");

/** Ícone quadrado: monograma da logo original sobre o azul, com margem. */
async function icone(tamanho, arquivo) {
  const interno = Math.round(tamanho * 0.78);
  const monograma = await sharp(ORIGEM).extract(AREA_MONOGRAMA).resize({ width: interno }).toBuffer();
  await sharp({ create: { width: tamanho, height: tamanho, channels: 3, background: NAVY } })
    .composite([{ input: monograma, gravity: "center" }])
    .png()
    .toFile(arquivo);
}

await icone(512, "src/app/icon.png");
await icone(180, "src/app/apple-icon.png");

// favicon.ico (32×32) — um ICO pode conter um PNG direto.
await icone(32, "public/brand/favicon-32.png");
const png32 = readFileSync("public/brand/favicon-32.png");
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); // reservado
ico.writeUInt16LE(1, 2); // tipo: ícone
ico.writeUInt16LE(1, 4); // uma imagem
ico.writeUInt8(32, 6); // largura
ico.writeUInt8(32, 7); // altura
ico.writeUInt16LE(1, 10); // planos
ico.writeUInt16LE(32, 12); // bits por pixel
ico.writeUInt32LE(png32.length, 14);
ico.writeUInt32LE(22, 18); // posição dos dados
writeFileSync("src/app/favicon.ico", Buffer.concat([ico, png32]));
unlinkSync("public/brand/favicon-32.png");

// Imagem de compartilhamento (Open Graph) 1200×630.
const logoOg = await sharp(ORIGEM).extract(AREA_COMPLETA).resize({ height: 330 }).toBuffer();
const textoOg = Buffer.from(`
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <line x1="600" y1="190" x2="600" y2="440" stroke="#8C96A8" stroke-width="1"/>
  <text x="650" y="285" font-family="Georgia, serif" font-size="44" fill="#E4E7E5">Soluções para a sua</text>
  <text x="650" y="340" font-family="Georgia, serif" font-size="44" fill="#E4E7E5">operação comercial</text>
  <text x="650" y="400" font-family="Arial, sans-serif" font-size="22" fill="#A9B2C3">Promotoria e ponto de venda</text>
  <text x="650" y="432" font-family="Arial, sans-serif" font-size="22" fill="#A9B2C3">Administrativo e financeiro</text>
</svg>`);
await sharp({ create: { width: 1200, height: 630, channels: 3, background: NAVY } })
  .composite([
    { input: logoOg, left: 110, top: 150 },
    { input: textoOg, left: 0, top: 0 },
  ])
  .png()
  .toFile("public/og-image.png");

console.log("Logos, ícones e imagem de compartilhamento gerados.");
