/**
 * Armazenamento dos documentos do Operações.
 * - Produção: Cloudflare R2, bucket PRIVADO e PRÓPRIO (variáveis OPS_R2_*).
 *   Sem R2 configurado, o envio fica DESLIGADO — nada é gravado no disco do
 *   servidor, que no Render é apagado a cada reinício.
 * - Desenvolvimento e testes: disco local em .data/documentos.
 * Nenhuma URL pública: o arquivo só sai por /api/documentos/:id, que confere a
 * permissão a cada acesso. O app nunca apaga arquivo: exclusão é lógica.
 */
import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { r2ConfigFromEnv, r2Request, type R2Config } from "./r2";

export interface StorageDriver {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

function r2Driver(cfg: R2Config): StorageDriver {
  return {
    async put(key, bytes, contentType) {
      const res = await r2Request(cfg, "PUT", key, { body: bytes, contentType });
      if (!res.ok) throw new Error(`Falha no upload (${res.status}): ${(await res.text()).slice(0, 200)}`);
    },
    async get(key) {
      const res = await r2Request(cfg, "GET", key);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Falha ao ler o arquivo (${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

export function localDriver(root: string): StorageDriver {
  const base = path.resolve(root);
  const safe = (key: string) => {
    const full = path.resolve(base, key);
    if (full !== base && !full.startsWith(base + path.sep)) throw new Error("Caminho inválido");
    return full;
  };
  return {
    async put(key, bytes) {
      const full = safe(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, bytes);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(safe(key)));
      } catch {
        return null;
      }
    },
  };
}

type GlobalWithStorage = typeof globalThis & { __opsStorage?: StorageDriver | null };
const g = globalThis as GlobalWithStorage;

/** null = armazenamento não configurado (produção sem OPS_R2_*). */
export function storage(): StorageDriver | null {
  if (g.__opsStorage !== undefined) return g.__opsStorage;
  const r2 = r2ConfigFromEnv();
  if (r2) g.__opsStorage = r2Driver(r2);
  else if (process.env.NODE_ENV === "production" && process.env.OPS_LOCAL_UPLOADS !== "demo") g.__opsStorage = null;
  else g.__opsStorage = localDriver(path.resolve(/*turbopackIgnore: true*/ process.env.OPS_UPLOADS_DIR ?? ".data/documentos"));
  return g.__opsStorage;
}

/** Testes: troca o driver (ex.: memória). */
export function setStorageForTests(driver: StorageDriver | null | undefined): void {
  g.__opsStorage = driver;
}
