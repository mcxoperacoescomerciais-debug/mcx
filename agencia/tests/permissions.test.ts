/** Perfis: painéis por perfil e equipe MCX (Dono cadastra Master). */
process.env.UPLOADS_DIR ??= ".data/test-uploads";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import { defaultPermissions, effectivePermissions, PANEL_KEYS, panelForPath, panelsForRole } from "../src/lib/permissions";

let db: DB;
let team: typeof import("../src/server/platform-team");

before(async () => {
  db = await memDb();
  team = await import("../src/server/platform-team");
});

describe("perfis e permissões", () => {
  test("rota → painel (o mais específico)", () => {
    assert.equal(panelForPath("/painel")?.key, "visao_geral");
    assert.equal(panelForPath("/painel/visitas/123")?.key, "visitas");
    assert.equal(panelForPath("/painel/rupturas")?.key, "estoque");
    assert.equal(panelForPath("/painel/cadastros/usuarios/novo")?.key, "usuarios");
    assert.equal(panelForPath("/painel/mcx"), null, "área MCX não é painel de agência");
  });

  test("gestor vem com tudo; supervisor com nada e nunca com cadastros", () => {
    assert.deepEqual(defaultPermissions("admin"), PANEL_KEYS);
    assert.deepEqual(defaultPermissions("manager"), []);
    assert.ok(!panelsForRole("manager").some((p) => p.key === "usuarios"));
    assert.equal(panelsForRole("promoter").length, 0);
    // Supervisor marcado com "usuarios" à força não ganha o painel.
    assert.deepEqual([...effectivePermissions("manager", ["mapa", "usuarios"])], ["mapa"]);
    // Usuário antigo (sem lista) mantém o padrão do perfil.
    assert.ok(effectivePermissions("manager", null).has("visitas"));
  });

  test("só o Dono cadastra Master", async () => {
    const [mcx] = await db.select().from(s.users).where(eq(s.users.username, "mcx"));
    const owner = { id: mcx.id, agencyId: mcx.agencyId, role: mcx.role, platform: true, platformRole: "owner" as const, permissions: null, name: mcx.name, username: mcx.username, mustChangePassword: false };
    const r = await team.createMaster(owner, { name: "Ana MCX", username: "ana.mcx", password: "teste" });
    assert.ok(r.ok, JSON.stringify(r));
    const [ana] = await db.select().from(s.users).where(eq(s.users.username, "ana.mcx"));
    assert.equal(ana.platform, true);
    assert.equal(ana.platformRole, "master");
    const master = { ...owner, id: ana.id, platformRole: "master" as const };
    const denied = await team.createMaster(master, { name: "Outro", username: "outro.mcx", password: "x" });
    assert.equal(denied.ok, false);
    assert.equal((await team.listPlatformTeam(master)).length, 0);
  });
});
