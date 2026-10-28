/**
 * Armazenamento das fotos (evidências).
 *
 * - Produção: Supabase Storage em bucket PRIVADO (`SUPABASE_URL` +
 *   `SUPABASE_SERVICE_KEY`, bucket `SUPABASE_BUCKET`). A chave de serviço fica
 *   só no servidor. Nenhuma URL pública: o arquivo só sai por /api/photos/:id,
 *   que confere a permissão de quem pede a cada acesso.
 * - Desenvolvimento: disco local em .data/uploads.
 *
 * Arquivos nunca são apagados pelo app: substituir/excluir foto é lógico
 * (deleted_at) e o original continua guardado como evidência.
 */
import "server-only";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

interface StorageDriver {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  /** Apaga os arquivos (os que não existem são ignorados). Devolve quantos foram pedidos. */
  remove(keys: string[]): Promise<number>;
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
    async remove(keys) {
      for (let i = 0; i < keys.length; i += 500) {
        const res = await fetch(`${baseUrl}/storage/v1/object/${bucket}`, {
          method: "DELETE",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ prefixes: keys.slice(i, i + 500) }),
        });
        if (!res.ok) throw new Error(`Falha ao apagar arquivos (${res.status}): ${await res.text()}`);
      }
      return keys.length;
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
    async remove(keys) {
      for (const key of keys) await rm(safe(key), { force: true });
      return keys.length;
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
      ? supabaseDriver(url, key, process.env.SUPABASE_BUCKET ?? "campo-evidencias")
      : localDriver(path.resolve(/*turbopackIgnore: true*/ process.env.UPLOADS_DIR ?? ".data/uploads"));
  return driver;
}

/** {agência}/{aaaa}/{mm}/{visita}/{atendimento}/{foto}[_thumb].jpg — organiza por mês para retenção. */
export function photoKeys(agencyId: string, visitDate: string, visitId: string, attendanceId: string, photoId: string) {
  const [y, m] = visitDate.split("-");
  const base = `${agencyId}/${y}/${m}/${visitId}/${attendanceId}/${photoId}`;
  return { full: `${base}.jpg`, thumb: `${base}_thumb.jpg` };
}
