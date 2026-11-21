/** Fase 6 — Importação do Notion: leitura do CSV, de-para, pré-visualização e importação sem duplicar. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq, isNull } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import { mapColumns, mapPriority, mapStatus, parseCsv, parseNotionDate, readNotionCsv, relationNames } from "../src/lib/notion-import";
import type { Actor } from "../src/server/demands";

let db: DB;
let notion: typeof import("../src/server/notion-import");
let maria: Actor, tainara: Actor;
let categoryId: string;

const CSV = [
  "Nome,Status,Responsável,Data de Término,Clientes,Prioridade,Etiquetas",
  '"Fechamento do café, novembro",Em andamento,Maria,30 de novembro de 2026,Helvecio-Café (https://www.notion.so/abc123),Alta,x',
  "Relatório Barão notion teste,Não iniciado,Tainara,2026-12-05,Helvecio-Barão,,",
  "Pedido Danper notion teste,Aguardando,,05/12/2026,William Danper,Urgente,",
  "Cobrar NF promotora notion teste,A fazer,Fulano de Tal,,Adriana,,",
  "Tarefa já feita notion teste,Concluído,Maria,2026-11-01,Etros,,",
  "Ajustar rota notion teste,Em revisão,Maria,data torta,Etros,,",
  "Organizar pasta notion teste,Não iniciado,Maria,,MCX,Baixa,",
  "Tarefa de cliente desconhecido notion,Não iniciado,Maria,,Padaria do Zé,,",
  "Tarefa sem cliente notion teste,Não iniciado,Maria,,,,",
  "Status esquisito notion teste,Pausado,Tainara,,Lucas,,",
  "Relatório Barão notion teste,Não iniciado,Tainara,2026-12-05,Helvecio-Barão,,",
  '"Tarefa com',
  'quebra de linha notion",Não iniciado,Maria,,Regis,,',
].join("\n");

before(async () => {
  db = await memDb();
  notion = await import("../src/server/notion-import");
  const users = await db.select().from(s.users);
  const actor = (name: string): Actor => {
    const u = users.find((x) => x.username === name)!;
    return { id: u.id, role: u.role };
  };
  maria = actor("maria");
  tainara = actor("tainara");
  categoryId = (await db.select().from(s.categories)).find((c) => c.name === "Interno MCX")!.id;
});

describe("leitura do CSV do Notion", () => {
  test("aspas, vírgula e quebra de linha dentro do campo; separador ; também", () => {
    assert.deepEqual(parseCsv('a,b\n"x, y","linha 1\nlinha 2"\n\n"diz ""oi""",z'), [["a", "b"], ["x, y", "linha 1\nlinha 2"], ['diz "oi"', "z"]]);
    assert.deepEqual(parseCsv("﻿a;b\r\n1;2\r\n"), [["a", "b"], ["1", "2"]]);
  });
  test("colunas reconhecidas pelo nome; o resto é listado como ignorado", () => {
    const { index, unknown } = mapColumns(["Nome", "Status", "Responsável", "Data de Término", "Clientes", "Prioridade", "Etiquetas"]);
    assert.deepEqual(index, { title: 0, status: 1, assignee: 2, due: 3, client: 4, priority: 5 });
    assert.deepEqual(unknown, ["Etiquetas"]);
    assert.ok(readNotionCsv("Coluna A,Coluna B\n1,2").error);
  });
  test("status 1:1, prioridade, relação e datas nos formatos do Notion", () => {
    assert.equal(mapStatus("Não iniciado"), "todo");
    assert.equal(mapStatus("Em andamento"), "doing");
    assert.equal(mapStatus("Aguardando retorno"), "waiting");
    assert.equal(mapStatus("Em revisão"), "approval");
    assert.equal(mapStatus("Concluído"), "skip");
    assert.equal(mapStatus("Arquivada"), "skip");
    assert.equal(mapStatus("Pausado"), null);
    assert.equal(mapPriority("Alta"), "high");
    assert.equal(mapPriority("qualquer"), null);
    assert.deepEqual(relationNames("Helvecio-Café (https://www.notion.so/abc), Etros (https://www.notion.so/def)"), ["Helvecio-Café", "Etros"]);
    assert.equal(parseNotionDate("30 de novembro de 2026"), "2026-11-30");
    assert.equal(parseNotionDate("November 5, 2026"), "2026-11-05");
    assert.equal(parseNotionDate("05/12/2026"), "2026-12-05");
    assert.equal(parseNotionDate("2026-12-05"), "2026-12-05");
    assert.equal(parseNotionDate("1 de dezembro de 2026 → 10 de dezembro de 2026"), "2026-12-10");
    assert.equal(parseNotionDate("2026-12-05 14:30"), "2026-12-05");
    assert.equal(parseNotionDate(""), null);
    assert.equal(parseNotionDate("semana que vem"), undefined);
    assert.equal(parseNotionDate("31/02/2026"), undefined);
  });
});

describe("pré-visualização e importação", () => {
  const count = async () => (await db.select().from(s.demands).where(isNull(s.demands.deletedAt))).length;

  test("só gestor e dono importam", async () => {
    assert.equal((await notion.importNotion(tainara, CSV, { dryRun: true })).ok, false);
    assert.equal((await notion.importNotion(tainara, CSV, { dryRun: false, categoryId })).ok, false);
  });

  test("prévia não grava e explica cada linha", async () => {
    const start = await count();
    const r = await notion.importNotion(maria, CSV, { dryRun: true });
    assert.ok(r.ok, r.ok ? "" : r.error);
    if (!r.ok) return;
    assert.equal(await count(), start);
    const row = (title: string) => r.rows.find((x) => x.title.startsWith(title))!;
    assert.equal(r.rows.length, 12);
    assert.deepEqual([row("Fechamento do café").clientName, row("Fechamento do café").brand, row("Fechamento do café").assigneeName, row("Fechamento do café").statusLabel, row("Fechamento do café").dueDate], ["Helvécio", "Café Bravo", "Maria", "Em andamento", "2026-11-30"]);
    assert.deepEqual([row("Relatório Barão").clientName, row("Relatório Barão").brand], ["Helvécio", "Barão"]);
    assert.deepEqual([row("Pedido Danper").clientName, row("Pedido Danper").brand, row("Pedido Danper").assigneeName, row("Pedido Danper").statusLabel], ["Helvécio", "Danper", null, "Aguardando retorno"]);
    assert.equal(row("Cobrar NF").clientName, "AF Merchandising");
    assert.equal(row("Cobrar NF").assigneeName, null, "responsável que não é usuário não é inventado");
    assert.ok(row("Cobrar NF").warnings.some((w) => /A distribuir/.test(w)));
    assert.equal(row("Tarefa já feita").action, "skip");
    assert.equal(row("Ajustar rota").dueDate, null);
    assert.ok(row("Ajustar rota").warnings.some((w) => /não reconhecida/.test(w)), "data torta entra sem prazo, com aviso");
    assert.equal(row("Ajustar rota").clientName, "Etros Promocional");
    assert.equal(row("Organizar pasta").clientName, "Interno MCX");
    assert.equal(row("Tarefa de cliente desconhecido").action, "skip");
    assert.deepEqual(r.unmatchedClients, ["Padaria do Zé"]);
    assert.equal(row("Tarefa sem cliente").action, "skip");
    assert.equal(row("Status esquisito").statusLabel, "A fazer");
    assert.ok(row("Status esquisito").warnings.some((w) => /não reconhecido/.test(w)));
    assert.equal(r.rows.filter((x) => x.title === "Relatório Barão notion teste" && x.action === "skip").length, 1, "linha repetida no arquivo");
    assert.equal(row("Tarefa com").title, "Tarefa com quebra de linha notion");
    assert.equal(r.toImport, 8);
    assert.equal(r.skipped, 4);
    assert.equal(r.unassigned, 2);
    assert.deepEqual(r.unknownColumns, ["Etiquetas"]);
  });

  test("importar exige categoria; grava status, prazo, marca e “A distribuir”; repetir não duplica", async () => {
    const start = await count();
    assert.equal((await notion.importNotion(maria, CSV, { dryRun: false })).ok, false, "sem categoria não importa");
    assert.equal(await count(), start);
    const r = await notion.importNotion(maria, CSV, { dryRun: false, categoryId });
    assert.ok(r.ok && r.created === 8);
    assert.equal(await count(), start + 8);
    const find = async (title: string) => (await db.select().from(s.demands).where(and(eq(s.demands.title, title), isNull(s.demands.deletedAt))))[0];
    const cafe = await find("Fechamento do café, novembro");
    assert.deepEqual([cafe.status, cafe.dueDate, cafe.brand, cafe.priority, cafe.assigneeId, cafe.origin], ["doing", "2026-11-30", "Café Bravo", "high", maria.id, "system"]);
    const danper = await find("Pedido Danper notion teste");
    assert.equal(danper.assigneeId, null, "sem responsável = A distribuir");
    assert.equal(danper.status, "waiting");
    assert.ok(danper.waitingFor && danper.followUpDate, "aguardando retorno entra visível na fila de cobrança");
    const rota = await find("Ajustar rota notion teste");
    assert.deepEqual([rota.status, rota.dueDate], ["approval", null]);
    const history = await db.select().from(s.demandHistory).where(eq(s.demandHistory.demandId, cafe.id));
    assert.equal(history[0].toValue, "Importada do Notion");
    assert.equal(await find("Tarefa já feita notion teste"), undefined);

    const again = await notion.importNotion(maria, CSV, { dryRun: false, categoryId });
    assert.ok(again.ok && again.created === 0);
    assert.equal(await count(), start + 8);
    if (again.ok) assert.ok(again.rows.find((x) => x.title.startsWith("Fechamento do café"))!.reason?.startsWith("Já existe no sistema"));
  });

  test("de-para informado na tela e “sem cliente → Interno MCX” liberam as linhas que tinham ficado de fora", async () => {
    const lucas = (await db.select().from(s.clients)).find((c) => c.name === "Lucas")!;
    const start = await count();
    const r = await notion.importNotion(maria, CSV, { dryRun: false, categoryId, clientMap: { "Padaria do Zé": lucas.id }, noClient: "internal" });
    assert.ok(r.ok && r.created === 2);
    assert.equal(await count(), start + 2);
    const [mapped] = await db.select().from(s.demands).where(eq(s.demands.title, "Tarefa de cliente desconhecido notion"));
    assert.equal(mapped.clientId, lucas.id);
    if (r.ok) assert.deepEqual(r.unmatchedClients, []);
  });
});
