/** Aviso de armazenamento: mede, envia o relatório e não repete mensagens. */
process.env.UPLOADS_DIR ??= ".data/test-uploads";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";

let db: DB;
let alert: typeof import("../src/server/storage-alert");
const sentTexts: string[] = [];

before(async () => {
  db = await memDb();
  alert = await import("../src/server/storage-alert");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes("callmebot")) {
      sentTexts.push(new URL(String(url)).searchParams.get("text") ?? "");
      return new Response("Message queued", { status: 200 });
    }
    return realFetch(url, init);
  }) as typeof fetch;
});

describe("aviso de armazenamento", () => {
  test("mensagem com uso, limite e alerta", () => {
    const u = { photosBytes: 0.85 * 1024 ** 3, photosLimit: 1024 ** 3, photosEstimated: false, dbBytes: 50 * 1024 ** 2, dbLimit: 0.5 * 1024 ** 3 };
    const text = alert.storageMessage(u, { photosBytes: 0.75 * 1024 ** 3, at: new Date(Date.now() - 7 * 86_400_000) }, 80);
    assert.match(text, /acima de 80%/);
    assert.match(text, /Fotos:\* 870 MB de 1 GB \(85%\)/);
    assert.match(text, /Previsão/);
  });

  test("sem ninguém com o aviso ligado, nada é enviado", async () => {
    const r = await alert.runStorageCheck();
    assert.deepEqual(r.sent, []);
  });

  test("com o aviso ligado: 1º relatório sai na hora e não se repete no mesmo dia", async () => {
    const [platform] = await db.select().from(s.agencies).where(eq(s.agencies.kind, "platform"));
    await db.update(s.agencies).set({ settings: { alerts: { whatsappPhone: "5531999998888", whatsappApiKey: "123", storageReport: true } } }).where(eq(s.agencies.id, platform.id));
    const first = await alert.runStorageCheck();
    assert.deepEqual(first.sent, ["weekly_report"]);
    assert.match(sentTexts.at(-1)!, /armazenamento da semana/);
    const again = await alert.runStorageCheck();
    assert.deepEqual(again.sent, [], "não duplica");
    const forced = await alert.runStorageCheck(new Date(), { force: true });
    assert.deepEqual(forced.sent, ["weekly_report"], "botão 'enviar agora' sempre envia");
  });
});
