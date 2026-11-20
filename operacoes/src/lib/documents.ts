/** Contratos e documentos: vocabulário e validações puras (sem banco). */
import { addDays } from "./dates";

export const DOCUMENT_CATEGORIES = ["Contrato", "Aditivo", "Nota fiscal", "Comprovante", "Documento de promotor", "Sistemática", "Mix/Tabela de preço", "Proposta", "Interno", "Outros"] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
/** Categorias que são SEMPRE restritas (só gestor e dono). */
export const ALWAYS_RESTRICTED: readonly string[] = ["Contrato", "Documento de promotor"];

export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export const CONTRACT_STATUSES = ["draft", "active", "ended", "cancelled"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = { draft: "Rascunho", active: "Vigente", ended: "Encerrado", cancelled: "Cancelado" };

/** Seções fixas da ficha operacional do contratante. */
export const PROFILE_SECTIONS = [
  { key: "pedidos", label: "Como faz pedido" },
  { key: "sistemas", label: "Sistemas usados" },
  { key: "visitas", label: "Regras de visita" },
  { key: "fechamento", label: "Fechamento" },
  { key: "relatorios", label: "Relatórios" },
  { key: "particularidades", label: "Particularidades" },
  { key: "credenciais", label: "Onde está a credencial (nunca a senha)" },
] as const;

/** Texto que parece conter uma senha escrita (ex.: "senha: abc123"). A ficha nunca guarda senha. */
export function looksLikePassword(text: string): boolean {
  return /\b(senha|password|pwd|pin|token)\b\s*[:=]\s*\S+/i.test(text) || /\b(senha|password)\s+(é|eh)\s+\S+/i.test(text);
}

const EXTENSIONS: Record<string, { type: string; magic: (b: Uint8Array) => boolean }> = {
  pdf: { type: "application/pdf", magic: (b) => ascii(b, 0, 5) === "%PDF-" },
  png: { type: "image/png", magic: (b) => b[0] === 0x89 && ascii(b, 1, 3) === "PNG" },
  jpg: { type: "image/jpeg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { type: "image/jpeg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  webp: { type: "image/webp", magic: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP" },
  xlsx: { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) },
  docx: { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) },
  csv: { type: "text/csv; charset=utf-8", magic: (b) => !b.subarray(0, 4096).includes(0) },
};

function ascii(b: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...b.subarray(start, start + length));
}

export const ACCEPTED_EXTENSIONS = Object.keys(EXTENSIONS).filter((e) => e !== "jpeg");

/**
 * Valida o arquivo pelo NOME e pelo CONTEÚDO (não confia no tipo informado pelo
 * navegador). Devolve o tipo que será servido no download.
 */
export function checkFile(fileName: string, bytes: Uint8Array): { ok: true; contentType: string; fileName: string } | { ok: false; error: string } {
  const name = fileName.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f"<>|:*?]/g, "").trim().slice(-120);
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const rule = EXTENSIONS[ext];
  if (!name || !rule) return { ok: false, error: `Tipo de arquivo não aceito. Use: ${ACCEPTED_EXTENSIONS.join(", ")}.` };
  if (bytes.length === 0) return { ok: false, error: "Arquivo vazio." };
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, error: `Arquivo grande demais (máximo de ${MAX_FILE_BYTES / 1024 / 1024} MB).` };
  if (!rule.magic(bytes)) return { ok: false, error: `O conteúdo do arquivo não corresponde a .${ext}.` };
  return { ok: true, contentType: rule.type, fileName: name };
}

/** Pré-visualização no navegador só para PDF e imagem; o resto é sempre baixado. */
export const canPreview = (contentType: string) => contentType === "application/pdf" || contentType.startsWith("image/");

/** Chave no bucket: por contratante, documento e versão. */
export function storageKey(clientId: string | null, documentId: string, version: number, fileName: string): string {
  const ext = fileName.split(".").pop()!.toLowerCase();
  return `${clientId ?? "interno"}/${documentId}/v${version}.${ext}`;
}

/** Fim da vigência: início + N meses − 1 dia (6 meses a partir de 01/01 termina em 30/06). */
export function contractEnd(startDate: string, termMonths: number): string {
  const [y, m, d] = startDate.split("-").map(Number);
  const total = m - 1 + termMonths;
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const same = `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  return addDays(same, -1);
}

/** Avisos devidos hoje para um contrato vigente: 30 e 7 dias antes do fim. */
export function contractAlertsDue(endDate: string | null, today: string): (30 | 7)[] {
  if (!endDate || endDate < today) return [];
  const due: (30 | 7)[] = [];
  if (addDays(today, 30) >= endDate) due.push(30);
  if (addDays(today, 7) >= endDate) due.push(7);
  return due;
}

export function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
