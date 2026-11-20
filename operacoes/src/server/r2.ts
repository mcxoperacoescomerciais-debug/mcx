/**
 * Cliente mínimo do Cloudflare R2 (API compatível com S3), com assinatura AWS
 * SigV4 feita aqui — sem SDK. Adaptado do r2.ts do MCX Campo, mas com variáveis
 * PRÓPRIAS (OPS_R2_*): o Operações nunca usa o bucket nem as chaves do Campo.
 */
import "server-only";
import { createHash, createHmac } from "node:crypto";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function r2ConfigFromEnv(env: Record<string, string | undefined> = process.env): R2Config | null {
  const accountId = env.OPS_R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.OPS_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.OPS_R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.OPS_R2_BUCKET?.trim();
  return accountId && accessKeyId && secretAccessKey && bucket ? { accountId, accessKeyId, secretAccessKey, bucket } : null;
}

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();
/** Codificação RFC 3986 que o S3 exige (encodeURIComponent deixa !'()* sem codificar). */
export const s3Encode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Cabeçalhos assinados (SigV4, região "auto", serviço "s3") — separado para testar. */
export function signR2(cfg: R2Config, method: string, key: string, body: Uint8Array | undefined, contentType: string | undefined, now: Date): { url: string; headers: Record<string, string> } {
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const path = `/${s3Encode(cfg.bucket)}/${key.split("/").map(s3Encode).join("/")}`;
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(body ?? "");
  const headers: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  if (contentType) headers["content-type"] = contentType;
  const names = Object.keys(headers).sort();
  const canonical = [method, path, "", names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, day), "auto"), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
  const sent: Record<string, string> = {};
  for (const n of names) if (n !== "host") sent[n] = headers[n];
  sent.Authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
  return { url: `https://${host}${path}`, headers: sent };
}

export function r2Request(cfg: R2Config, method: "GET" | "PUT", key: string, opts: { body?: Uint8Array; contentType?: string } = {}): Promise<Response> {
  const { url, headers } = signR2(cfg, method, key, opts.body, opts.contentType, new Date());
  return fetch(url, { method, headers, body: opts.body ? Buffer.from(opts.body) : undefined });
}
