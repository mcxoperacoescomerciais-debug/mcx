/** Isolamento: sessão própria, visibilidade do operacional e permissões por papel. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import { signSession } from "../src/lib/session-token";
import { addDays, todayIso } from "../src/lib/dates";
import { ROLE_ACTIONS, can } from "../src/lib/permissions";
import type { Actor } from "../src/server/demands";

let db: DB;
let auth: typeof import("../src/server/auth");
let demands: typeof import("../src/server/demands");
let registry: typeof import("../src/server/registry");
let eduardo: Actor, maria: Actor, tainara: Actor;
let clientId: string, categoryId: string;

before(async () => {
  db = await memDb();
  auth = await import("../src/server/auth");
  demands = await import("../src/server/demands");
  registry = await import("../src/server/registry");
  const users = await db.select().from(s.users);
  const actor = (name: string): Actor => {
    const u = users.find((x) => x.username === name)!;
    return { id: u.id, role: u.role };
  };
  eduardo = actor("eduardo");
  maria = actor("maria");
  tainara = actor("tainara");
  clientId = (await db.select().from(s.clients)).find((c) => c.kind === "agency")!.id;
  categoryId = (await db.select().from(s.categories))[0].id;
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("sessão", () => {
  test("sem cookie, cookie inválido ou cookie do Campo: ninguém entra", async () => {
    assert.equal(await auth.userFromToken(undefined), null);
    assert.equal(await auth.userFromToken("qualquer-coisa"), null);
    // Token no formato do MCX Campo (outro segredo, sem emissor do Operações).
    const campo = await new SignJWT({ uid: eduardo.id, aid: "x", role: "admin", sv: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("30d")
      .sign(new TextEncoder().encode("dev-only-secret-change-me-in-production-0123456789"));
    assert.equal(await auth.userFromToken(campo), null);
    // Mesmo assinado com o segredo certo, sem o emissor do Operações não vale.
    const semEmissor = await new SignJWT({ uid: eduardo.id, role: "owner", sv: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("30d")
      .sign(new TextEncoder().encode("ops-dev-only-secret-change-me-0123456789abcdef"));
    assert.equal(await auth.userFromToken(semEmissor), null);
  });

  test("sessão válida entra; sessão revogada (session_version) não", async () => {
    const ok = await signSession({ uid: tainara.id, role: "operacional", sv: 1 });
    assert.equal((await auth.userFromToken(ok))?.username, "tainara");
    const old = await signSession({ uid: tainara.id, role: "operacional", sv: 99 });
    assert.equal(await auth.userFromToken(old), null);
  });

  test("toda server action começa conferindo a sessão", () => {
    const src = readFileSync("src/app/actions.ts", "utf8");
    const bodies = src.split(/export async function /).slice(1);
    assert.ok(bodies.length >= 15);
    for (const body of bodies) {
      const name = body.slice(0, body.indexOf("("));
      assert.match(body, /const user = await actionUser\(\);\s+if \(!user\) return EXPIRED;/, `${name} não confere a sessão`);
    }
    // Fora de actions.ts, só existem as actions públicas de entrar/trocar senha.
    const others = walk("src").filter((f) => /\.tsx?$/.test(f) && /^["']use server["']/m.test(readFileSync(f, "utf8")));
    assert.deepEqual(others.map((f) => f.replaceAll("\\", "/")).sort(), ["src/app/actions.ts", "src/app/entrar/actions.ts"]);
  });

  test("rotas de API: atividade exige sessão; cron exige segredo; saúde não expõe dados", () => {
    const routes = walk(path.join("src", "app", "api")).filter((f) => f.endsWith("route.ts")).map((f) => f.replaceAll("\\", "/")).sort();
    assert.deepEqual(routes, ["src/app/api/assistente/route.ts", "src/app/api/atividade/route.ts", "src/app/api/cron/rotinas/route.ts", "src/app/api/documentos/[id]/route.ts", "src/app/api/documentos/route.ts", "src/app/api/health/route.ts"]);
    for (const route of ["src/app/api/assistente/route.ts", "src/app/api/documentos/[id]/route.ts", "src/app/api/documentos/route.ts"]) assert.match(readFileSync(route, "utf8"), /const user = await getSessionUser\(\);\s+if \(!user\) return /, route);
    assert.match(readFileSync("src/app/api/atividade/route.ts", "utf8"), /const user = await getSessionUser\(\);\s+if \(!user\) return new Response\(null, \{ status: 401 \}\);/);
    assert.match(readFileSync("src/app/api/cron/rotinas/route.ts", "utf8"), /if \(!authorized\(request\)\) return/);
  });

  test("toda página da área logada exige usuário", () => {
    const pages = walk(path.join("src", "app", "(app)")).filter((f) => f.endsWith("page.tsx"));
    assert.ok(pages.length >= 8);
    for (const page of pages) assert.match(readFileSync(page, "utf8"), /await require(User|Can)\(/, `${page} não exige usuário`);
  });
});

describe("visibilidade e papéis", () => {
  const input = (assigneeId: string, title: string) => ({ title, clientId, categoryId, assigneeId, dueDate: addDays(todayIso(), 2) });

  test("operacional não lê demanda de outra pessoa, mesmo com o ID", async () => {
    const created = await demands.createDemand(maria, input(maria.id, "Conferir contrato sigiloso zzz"));
    assert.ok(created.ok);
    const id = created.ok ? created.id : "";
    assert.equal(await demands.getDemand(tainara, id), null);
    assert.equal((await demands.listDemands(tainara, { status: "open" })).some((d) => d.id === id), false);
    for (const attempt of [
      demands.updateDemand(tainara, id, { title: "invadido" }),
      demands.changeStatus(tainara, id, "done", { minutes: 10 }),
      demands.addComment(tainara, id, "oi"),
      demands.addChecklistItem(tainara, id, "item"),
    ]) {
      assert.equal((await attempt).ok, false);
    }
    // Compartilhada pelo gestor: passa a ver.
    assert.ok((await demands.setShares(maria, id, [tainara.id])).ok);
    assert.equal((await demands.getDemand(tainara, id))?.id, id);
    assert.equal((await demands.setShares(tainara, id, [])).ok, false, "operacional não compartilha");
  });

  test("operacional vê o que é dela e o que criou; não troca responsável nem reabre", async () => {
    const mine = await demands.createDemand(maria, input(tainara.id, "Enviar lojas ao promotor qqq"));
    assert.ok(mine.ok);
    const id = mine.ok ? mine.id : "";
    assert.equal((await demands.getDemand(tainara, id))?.id, id);
    assert.equal((await demands.updateDemand(tainara, id, { assigneeId: maria.id })).ok, false);
    assert.ok((await demands.changeStatus(tainara, id, "done", { minutes: 10 })).ok);
    assert.equal((await demands.changeStatus(tainara, id, "todo")).ok, false, "reabrir é do gestor");
    assert.ok((await demands.changeStatus(maria, id, "todo")).ok);
    assert.equal((await demands.deleteDemand(tainara, id, "motivo qualquer")).ok, false);
  });

  test("cadastros: operacional não edita contratante, categoria nem usuário; gestor não mexe em usuário", async () => {
    assert.equal((await registry.saveClient(tainara, null, { name: "Novo", kind: "agency" })).ok, false);
    assert.equal((await registry.saveCategory(tainara, null, { name: "Nova" })).ok, false);
    assert.equal((await registry.createUser(maria, { name: "X", username: "xis", role: "operacional", password: "abcdef" })).ok, false);
    assert.deepEqual(await registry.listUsers(maria), []);
    assert.ok((await registry.listUsers(eduardo)).length >= 3);
    assert.equal((await registry.updateUser(eduardo, eduardo.id, { status: "inactive" })).ok, false, "dono não se desativa");
  });

  test("mapa de papéis: dono tem tudo; operacional só cria demanda, vê contratantes, movimenta estoque e pode ser liberado no Assistente", () => {
    assert.deepEqual([...ROLE_ACTIONS.operacional].sort(), ["assistant.use", "client.view", "demand.create", "document.upload", "document.view", "stock.move", "stock.view"]);
    for (const a of ["time.viewAll", "team.view", "report.view", "cost.view", "routine.manage", "template.manage"] as const) {
      assert.equal(can("operacional", a), false, a);
      assert.equal(can("gestor", a), true, a);
    }
    assert.equal(can("gestor", "user.manage"), false);
    assert.equal(can("owner", "user.manage"), true);
  });

  test("desativar a pessoa derruba a sessão dela", async () => {
    const created = await registry.createUser(eduardo, { name: "Teste", username: "teste.saida", role: "operacional", password: "abcdef" });
    assert.ok(created.ok);
    const [u] = (await db.select().from(s.users)).filter((x) => x.username === "teste.saida");
    const token = await signSession({ uid: u.id, role: u.role, sv: u.sessionVersion });
    assert.ok(await auth.userFromToken(token));
    assert.ok((await registry.updateUser(eduardo, u.id, { status: "inactive" })).ok);
    assert.equal(await auth.userFromToken(token), null);
  });
});
