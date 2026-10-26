/** Mapa ao vivo (onde cada promotor está agora) e permissão de foto da galeria. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import type { Scope } from "../src/server/auth";
import { galleryAllowedFor } from "../src/lib/settings";

let db: DB;
const scopes: Record<string, Scope> = {};

before(async () => {
  db = await memDb();
  const auth = await import("../src/server/auth");
  for (const u of ["admin", "lucas", "joao"]) scopes[u] = await auth.scopeForUser((await db.select().from(s.users).where(eq(s.users.username, u)))[0]);
});

describe("acompanhamento ao vivo", () => {
  test("promotor com visita aberta aparece na loja; online depende do último sinal do app", async () => {
    const { liveOperations } = await import("../src/server/map");
    await db.update(s.users).set({ lastSeenAt: new Date() }).where(eq(s.users.id, scopes.joao.userId));
    await db.update(s.users).set({ lastSeenAt: new Date(Date.now() - 60 * 60_000) }).where(eq(s.users.id, scopes.lucas.userId));
    const live = await liveOperations(scopes.admin);
    const joao = live.promoters.find((p) => p.promoterId === scopes.joao.userId);
    assert.ok(joao, "João tem programação hoje");
    assert.equal(joao.online, true);
    const lucas = live.promoters.find((p) => p.promoterId === scopes.lucas.userId);
    if (lucas) assert.equal(lucas.online, false, "sinal de 1 h atrás não é online");
    for (const p of live.promoters) {
      if (p.current) {
        assert.equal(p.status, "in_store");
        assert.ok(live.events.some((e) => e.id === `in:${p.current!.visitId}` && e.kind === "checkin"), "a chegada vira aviso");
      }
    }
    assert.ok(live.events.every((e, i, a) => i === 0 || a[i - 1].at >= e.at), "avisos do mais novo para o mais antigo");
  });

  test("o app atualizar marca o promotor como online", async () => {
    const { buildBootstrap } = await import("../src/server/promoter");
    await db.update(s.users).set({ lastSeenAt: null }).where(eq(s.users.id, scopes.lucas.userId));
    await buildBootstrap(scopes.lucas);
    await new Promise((r) => setTimeout(r, 50));
    const [u] = await db.select({ lastSeenAt: s.users.lastSeenAt }).from(s.users).where(eq(s.users.id, scopes.lucas.userId));
    assert.ok(u.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < 60_000);
  });
});

describe("foto da galeria", () => {
  test("regra da agência: marca, ninguém ou só autorizados", async () => {
    assert.equal(galleryAllowedFor("brand", false), true);
    assert.equal(galleryAllowedFor("none", true), false);
    assert.equal(galleryAllowedFor("authorized", false), false);
    assert.equal(galleryAllowedFor("authorized", true), true);
    const { buildBootstrap } = await import("../src/server/promoter");
    const lucas = scopes.lucas;
    const none = await buildBootstrap({ ...lucas, settings: { ...lucas.settings, galleryPolicy: "none" } });
    assert.ok(none.brands.every((b) => !b.allowGallery), "só câmera para todos");
    const auth = await buildBootstrap({ ...lucas, settings: { ...lucas.settings, galleryPolicy: "authorized" } });
    assert.ok(auth.brands.every((b) => !b.allowGallery), "Lucas ainda não autorizado");
    const admin = await import("../src/server/admin");
    assert.ok((await admin.saveGalleryAuthorized(scopes.admin, [lucas.userId])).ok);
    const ok = await buildBootstrap({ ...lucas, settings: { ...lucas.settings, galleryPolicy: "authorized" } });
    const brands = await db.select().from(s.brands);
    for (const b of ok.brands) assert.equal(b.allowGallery, brands.find((x) => x.id === b.id)!.allowGallery, "autorizado: vale a regra da marca");
  });
});
