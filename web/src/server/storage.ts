/**
 * Armazenamento de arquivos (fotos das ocorrências).
 *
 * - Produção: Supabase Storage em bucket PRIVADO (`SUPABASE_URL` +
 *   `SUPABASE_SERVICE_KEY`, bucket em `SUPABASE_BUCKET`, padrão
 *   "occurrence-photos"). Nenhuma URL pública: o arquivo só sai pelo
 *   /api/photos/:id, que confere a permissão de quem pede.
 * - Desenvolvimento: disco local em .data/uploads.
 */
import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

interface StorageDriver {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

function supabaseDriver(baseUrl: string, serviceKey: string, bucket: string): StorageDriver {
  const headers = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
  const objectUrl = (key: string) => `${baseUrl}/storage/v1/object/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  return {
    async put(key, bytes, contentType) {
      const res = await fetch(objectUrl(key), {
        method: "POST",
        headers: { ...headers, "Content-Type": contentType, "x-upsert": "true" },
        body: Buffer.from(bytes),
      });
      if (!res.ok) throw new Error(`Falha no upload (${res.status}): ${await res.text()}`);
    },
    async get(key) {
      const res = await fetch(objectUrl(key).replace("/object/", "/object/authenticated/"), { headers });
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) throw new Error(`Falha ao ler arquivo (${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

function localDriver(root: string): StorageDriver {
  const safe = (key: string) => {
    const full = path.resolve(root, key);
    if (!full.startsWith(path.resolve(root))) throw new Error("Caminho inválido");
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

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (driver) return driver;
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY;
  driver =
    url && key
      ? supabaseDriver(url, key, process.env.SUPABASE_BUCKET ?? "occurrence-photos")
      : localDriver(path.resolve(".data/uploads"));
  return driver;
}

/** Caminho organizado por cliente e mês: facilita retenção e auditoria. */
export function photoKey(tenantId: string, clientId: string, visitDate: string, visitId: string, photoId: string): string {
  const [y, m] = visitDate.split("-");
  return `${tenantId}/${clientId}/${y}/${m}/${visitId}/${photoId}.jpg`;
}
