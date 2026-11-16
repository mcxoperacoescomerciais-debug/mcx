/**
 * Cliente mínimo do Cloudflare R2 (API compatível com S3), com assinatura
 * AWS SigV4 feita aqui mesmo — sem SDK. Só o necessário para as fotos:
 * gravar, ler, apagar e somar o tamanho do bucket.
 *
 * Variáveis: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
 * Bucket PRIVADO: as fotos só saem por /api/photos/:id (com permissão).
 */
import "server-only";
import { createHash, createHmac } from "node:crypto";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function r2ConfigFromEnv(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  return accountId && accessKeyId && secretAccessKey && bucket ? { accountId, accessKeyId, secretAccessKey, bucket } : null;
}

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();
/** Codificação RFC 3986 que o S3 exige (encodeURIComponent deixa !'()* sem codificar). */
export const s3Encode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Cabeçalhos assinados (SigV4, região "auto", serviço "s3") — separado para testar. */
export function signR2(
  cfg: R2Config,
  method: string,
  key: string,
  query: Record<string, string>,
  body: Uint8Array | undefined,
  contentType: string | undefined,
  now: Date,
): { url: string; headers: Record<string, string> } {
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const path = `/${s3Encode(cfg.bucket)}${key ? "/" + key.split("/").map(s3Encode).join("/") : ""}`;
  const qs = Object.entries(query)
    .map(([k, v]) => [s3Encode(k), s3Encode(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(body ?? "");
  const headers: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  if (contentType) headers["content-type"] = contentType;
  const names = Object.keys(headers).sort();
  const canonical = [method, path, qs, names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, day), "auto"), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
  const sent: Record<string, string> = {};
  for (const n of names) if (n !== "host") sent[n] = headers[n];
  sent.Authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
  return { url: `https://${host}${path}${qs ? `?${qs}` : ""}`, headers: sent };
}

/** Requisição assinada. `key` vazio = o próprio bucket. */
export function r2Request(
  cfg: R2Config,
  method: "GET" | "PUT" | "DELETE",
  key: string,
  opts: { query?: Record<string, string>; body?: Uint8Array; contentType?: string } = {},
): Promise<Response> {
  const { url, headers } = signR2(cfg, method, key, opts.query ?? {}, opts.body, opts.contentType, new Date());
  return fetch(url, { method, headers, body: opts.body ? Buffer.from(opts.body) : undefined });
}

const unxml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Soma do tamanho de todos os arquivos do bucket (lista em páginas de 1000). */
export async function r2BucketBytes(cfg: R2Config): Promise<{ bytes: number; objects: number }> {
  let bytes = 0;
  let objects = 0;
  let token: string | undefined;
  for (let page = 0; page < 10_000; page++) {
    const res = await r2Request(cfg, "GET", "", { query: { "list-type": "2", "max-keys": "1000", ...(token ? { "continuation-token": token } : {}) } });
    if (!res.ok) throw new Error(`R2: falha ao listar (${res.status})`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Size>(\d+)<\/Size>/g)) {
      bytes += Number(m[1]);
      objects++;
    }
    const next = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1] : undefined;
    if (!next) break;
    token = unxml(next);
  }
  return { bytes, objects };
}
