/** Fotos no Cloudflare R2: assinatura das requisições e leitura das fotos antigas no Supabase. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { r2ConfigFromEnv, s3Encode, signR2 } from "../src/server/r2";
import { withFallback, type StorageDriver } from "../src/server/storage";

const cfg = { accountId: "abc123", accessKeyId: "KEYID", secretAccessKey: "SECRET", bucket: "mcx-fotos" };

function memDriver(files: Record<string, string>): StorageDriver & { files: Record<string, string> } {
  return {
    files,
    async put(key, bytes) {
      files[key] = Buffer.from(bytes).toString();
    },
    async get(key) {
      return key in files ? new Uint8Array(Buffer.from(files[key])) : null;
    },
    async remove(keys) {
      for (const k of keys) delete files[k];
      return keys.length;
    },
  };
}

describe("fotos no R2", () => {
  test("monta a URL do bucket e assina com SigV4 (região auto)", () => {
    const { url, headers } = signR2(cfg, "PUT", "ag/2026/11/v/a/foto.jpg", {}, new Uint8Array([1, 2]), "image/jpeg", new Date("2026-11-17T12:00:00Z"));
    assert.equal(url, "https://abc123.r2.cloudflarestorage.com/mcx-fotos/ag/2026/11/v/a/foto.jpg");
    assert.equal(headers["x-amz-date"], "20261117T120000Z");
    assert.match(headers.Authorization, /^AWS4-HMAC-SHA256 Credential=KEYID\/20261117\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    assert.equal(headers.host, undefined, "o host vai pela URL");
  });

  test("lista com a query ordenada e codificada", () => {
    const { url } = signR2(cfg, "GET", "", { "list-type": "2", "continuation-token": "a/b+c=" }, undefined, undefined, new Date());
    assert.ok(url.endsWith("/mcx-fotos?continuation-token=a%2Fb%2Bc%3D&list-type=2"), url);
    assert.equal(s3Encode("a(b)!*'"), "a%28b%29%21%2A%27");
  });

  test("sem as 4 variáveis, o R2 fica desligado", () => {
    const saved = { ...process.env };
    process.env.R2_ACCOUNT_ID = "x";
    process.env.R2_ACCESS_KEY_ID = "y";
    process.env.R2_SECRET_ACCESS_KEY = "z";
    delete process.env.R2_BUCKET;
    assert.equal(r2ConfigFromEnv(), null);
    process.env.R2_BUCKET = "b";
    assert.deepEqual(r2ConfigFromEnv(), { accountId: "x", accessKeyId: "y", secretAccessKey: "z", bucket: "b" });
    for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) if (saved[k] === undefined) delete process.env[k];
  });

  test("grava no R2, lê as fotos antigas no Supabase e apaga nos dois", async () => {
    const r2 = memDriver({});
    const supabase = memDriver({ "antiga.jpg": "velha" });
    const st = withFallback(r2, supabase);
    await st.put("nova.jpg", new Uint8Array(Buffer.from("nova")), "image/jpeg");
    assert.deepEqual(Object.keys(r2.files), ["nova.jpg"]);
    assert.deepEqual(Object.keys(supabase.files), ["antiga.jpg"]);
    assert.equal(Buffer.from((await st.get("nova.jpg"))!).toString(), "nova");
    assert.equal(Buffer.from((await st.get("antiga.jpg"))!).toString(), "velha");
    assert.equal(await st.get("nenhuma.jpg"), null);
    await st.remove(["nova.jpg", "antiga.jpg"]);
    assert.deepEqual(r2.files, {});
    assert.deepEqual(supabase.files, {});
  });
});
