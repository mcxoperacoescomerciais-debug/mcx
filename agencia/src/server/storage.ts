/**
 * Armazenamento das fotos (evidências).
 *
 * - Produção: Cloudflare R2 (bucket PRIVADO, variáveis R2_*; ver src/server/r2.ts).
 *   As fotos gravadas antes da troca continuam no Supabase: a leitura procura
 *   no R2 e, se não achar, no Supabase — nada precisa ser copiado.
 * - Antes do R2: Supabase Storage em bucket PRIVADO (`SUPABASE_URL` +
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
import { r2ConfigFromEnv, r2Request, type R2Config } from "./r2";

export interface StorageDriver {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  /** Leitura em fluxo (sem carregar o arquivo inteiro na memória); ausente no disco local. */
  stream?(key: string): Promise<ReadableStream<Uint8Array> | null>;
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
    async stream(key) {
      const res = await fetch(objectUrl(key).replace("/object/", "/object/authenticated/"), { headers });
      if (res.ok) return res.body;
      await res.body?.cancel().catch(() => undefined);
      if (res.status === 404 || res.status === 400) return null;
      throw new Error(`Falha ao ler arquivo (${res.status})`);
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

function r2Driver(cfg: R2Config): StorageDriver {
  return {
    async put(key, bytes, contentType) {
      const res = await r2Request(cfg, "PUT", key, { body: bytes, contentType });
      if (!res.ok) throw new Error(`Falha no upload R2 (${res.status}): ${(await res.text()).slice(0, 200)}`);
    },
    async get(key) {
      const res = await r2Request(cfg, "GET", key);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Falha ao ler arquivo R2 (${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async stream(key) {
      const res = await r2Request(cfg, "GET", key);
      if (res.ok) return res.body;
      await res.body?.cancel().catch(() => undefined);
      if (res.status === 404) return null;
      throw new Error(`Falha ao ler arquivo R2 (${res.status})`);
    },
    async remove(keys) {
      // Um por um, 10 de cada vez (apagar o que não existe também responde ok).
      for (let i = 0; i < keys.length; i += 10) {
        const res = await Promise.all(keys.slice(i, i + 10).map((k) => r2Request(cfg, "DELETE", k)));
        const bad = res.find((r) => !r.ok && r.status !== 404);
        if (bad) throw new Error(`Falha ao apagar arquivos R2 (${bad.status})`);
      }
      return keys.length;
    },
  };
}

/** Grava no novo; lê no novo e, se não achar, no antigo; apaga nos dois. */
export function withFallback(primary: StorageDriver, old: StorageDriver): StorageDriver {
  return {
    put: (key, bytes, contentType) => primary.put(key, bytes, contentType),
    async get(key) {
      return (await primary.get(key)) ?? (await old.get(key).catch(() => null));
    },
    async stream(key) {
      if (!primary.stream || !old.stream) {
        const bytes = (await primary.get(key)) ?? (await old.get(key).catch(() => null));
        return bytes ? new Response(Buffer.from(bytes)).body : null;
      }
      return (await primary.stream(key)) ?? (await old.stream(key).catch(() => null));
    },
    async remove(keys) {
      await old.remove(keys).catch((e: Error) => console.error("[storage] antigo:", e.message));
      return primary.remove(keys);
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
  const supabase = url && key ? supabaseDriver(url, key, process.env.SUPABASE_BUCKET ?? "campo-evidencias") : null;
  const r2 = r2ConfigFromEnv();
  driver = r2
    ? supabase
      ? withFallback(r2Driver(r2), supabase)
      : r2Driver(r2)
    : (supabase ?? localDriver(path.resolve(/*turbopackIgnore: true*/ process.env.UPLOADS_DIR ?? ".data/uploads")));
  return driver;
}

/** {agência}/{aaaa}/{mm}/{visita}/{atendimento}/{foto}[_thumb].jpg — organiza por mês para retenção. */
export function photoKeys(agencyId: string, visitDate: string, visitId: string, attendanceId: string, photoId: string) {
  const [y, m] = visitDate.split("-");
  const base = `${agencyId}/${y}/${m}/${visitId}/${attendanceId}/${photoId}`;
  return { full: `${base}.jpg`, thumb: `${base}_thumb.jpg` };
}
