/** Fase 5 — Contratos e documentos: validação de arquivo, restrição, versões, aditivos, avisos e ficha operacional. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import { addDays, todayIso } from "../src/lib/dates";
import { checkFile, contractAlertsDue, contractEnd, looksLikePassword, MAX_FILE_BYTES, storageKey } from "../src/lib/documents";
import { can } from "../src/lib/permissions";
import type { Actor } from "../src/server/demands";
import type { StorageDriver } from "../src/server/storage";

let db: DB;
let contracts: typeof import("../src/server/contracts");
let documents: typeof import("../src/server/documents");
let storageMod: typeof import("../src/server/storage");
let crm: typeof import("../src/server/crm");
let eduardo: Actor, maria: Actor, tainara: Actor;
let clientId: string, otherClientId: string;
const today = todayIso();
const files = new Map<string, Uint8Array>();
const memory: StorageDriver = {
  async put(key, bytes) {
    files.set(key, bytes);
  },
  async get(key) {
    return files.get(key) ?? null;
  },
};

const text = (v: string) => new TextEncoder().encode(v);
const PDF = text("%PDF-1.7\nconteúdo de teste\n%%EOF");
const PDF2 = text("%PDF-1.7\nsegunda versão\n%%EOF");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

before(async () => {
  db = await memDb();
  contracts = await import("../src/server/contracts");
  documents = await import("../src/server/documents");
  storageMod = await import("../src/server/storage");
  crm = await import("../src/server/crm");
  storageMod.setStorageForTests(memory);
  const users = await db.select().from(s.users);
  const actor = (name: string): Actor => {
    const u = users.find((x) => x.username === name)!;
    return { id: u.id, role: u.role };
  };
  eduardo = actor("eduardo");
  maria = actor("maria");
  tainara = actor("tainara");
  const clients = await db.select().from(s.clients);
  clientId = clients.find((c) => c.name === "AF Merchandising")!.id;
  otherClientId = clients.find((c) => c.name === "Etros Promocional")!.id;
});

describe("validações puras", () => {
  test("arquivo: tipo pelo nome E pelo conteúdo, tamanho e nome saneado", () => {
    assert.ok(checkFile("contrato.pdf", PDF).ok);
    assert.ok(checkFile("foto.PNG", PNG).ok);
    assert.equal(checkFile("virus.exe", PDF).ok, false);
    assert.equal(checkFile("pagina.html", text("<script>alert(1)</script>")).ok, false);
    assert.equal(checkFile("falso.pdf", text("<html>não sou pdf</html>")).ok, false, "conteúdo não bate com a extensão");
    assert.equal(checkFile("falso.png", PDF).ok, false);
    assert.equal(checkFile("vazio.pdf", new Uint8Array()).ok, false);
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set(PDF);
    assert.equal(checkFile("grande.pdf", big).ok, false);
    const named = checkFile("../../etc/pas<s>wd.csv", text("a;b\n1;2"));
    assert.ok(named.ok && !/[\\/<>]/.test(named.fileName));
    assert.equal(checkFile("binario.csv", new Uint8Array([65, 0, 66])).ok, false);
  });
  test("chave no bucket: por contratante, documento e versão (sem o nome original)", () => {
    assert.equal(storageKey("cli", "doc", 3, "Contrato AF assinado.PDF"), "cli/doc/v3.pdf");
    assert.equal(storageKey(null, "doc", 1, "nota.csv"), "interno/doc/v1.csv");
  });
  test("vigência e avisos de 30 e 7 dias", () => {
    assert.equal(contractEnd("2026-01-01", 6), "2026-06-30");
    assert.equal(contractEnd("2026-08-31", 6), "2027-02-27");
    assert.equal(contractEnd("2026-11-15", 12), "2027-11-14");
    assert.deepEqual(contractAlertsDue("2026-12-31", "2026-11-20"), []);
    assert.deepEqual(contractAlertsDue("2026-12-20", "2026-11-20"), [30]);
    assert.deepEqual(contractAlertsDue("2026-11-25", "2026-11-20"), [30, 7]);
    assert.deepEqual(contractAlertsDue("2026-11-10", "2026-11-20"), [], "já vencido não avisa de novo");
    assert.deepEqual(contractAlertsDue(null, "2026-11-20"), []);
  });
  test("ficha: detecta senha escrita, mas aceita dizer onde ela está", () => {
    assert.equal(looksLikePassword("Portal do cliente. Senha: Abc@123"), true);
    assert.equal(looksLikePassword("login maria / password = 1234"), true);
    assert.equal(looksLikePassword("a senha é mcx2026"), true);
    assert.equal(looksLikePassword("A senha está no cofre de senhas da Maria"), false);
    assert.equal(looksLikePassword("Pedidos pelo portal, toda segunda"), false);
  });
});

describe("contratos", () => {
  test("operacional não lê nem cria contrato; gestor cria", async () => {
    assert.ok(!can("operacional", "contract.view"));
    const input = { clientId, services: "Backoffice + App", monthlyValueCents: 350000, startDate: "2026-07-01", termMonths: 6, status: "active" as const, dueDay: 10 };
    assert.equal((await contracts.saveContract(tainara, null, input)).ok, false);
    const created = await contracts.saveContract(maria, null, input);
    assert.ok(created.ok);
    const id = created.ok ? created.id : "";
    assert.deepEqual(await contracts.listContracts(tainara), []);
    assert.equal(await contracts.getContract(tainara, id), null);
    assert.equal((await contracts.addAmendment(tainara, id, { day: today, description: "tentativa", newValueCents: 1 })).ok, false);
    assert.equal((await contracts.deleteContract(tainara, id, "motivo qualquer")).ok, false);
    const c = await contracts.getContract(maria, id);
    assert.equal(c?.endDate, "2026-12-31");
    const [client] = await db.select().from(s.clients).where(eq(s.clients.id, clientId));
    assert.equal(client.monthlyValueCents, 350000, "valor do contratante acompanha o contrato vigente");
  });

  test("validações e contrato vigente só muda valor e prazo por aditivo (com histórico)", async () => {
    assert.equal((await contracts.saveContract(maria, null, { clientId, services: "x", monthlyValueCents: 100 })).ok, false);
    assert.equal((await contracts.saveContract(maria, null, { clientId, services: "Serviço", monthlyValueCents: -1 })).ok, false);
    assert.equal((await contracts.saveContract(maria, null, { clientId, services: "Serviço", monthlyValueCents: 100, status: "active" })).ok, false, "vigente sem início");
    const created = await contracts.saveContract(maria, null, { clientId: otherClientId, services: "White label", monthlyValueCents: 500000, startDate: "2026-06-01", termMonths: 6, status: "active" });
    assert.ok(created.ok);
    const id = created.ok ? created.id : "";
    assert.equal((await contracts.saveContract(maria, id, { clientId: otherClientId, services: "White label", monthlyValueCents: 600000, startDate: "2026-06-01", termMonths: 6, status: "active" })).ok, false);
    assert.ok((await contracts.saveContract(maria, id, { clientId: otherClientId, services: "White label + relatórios", monthlyValueCents: 500000, startDate: "2026-06-01", termMonths: 6, status: "active", autoRenew: true })).ok, "serviços e renovação podem mudar");
    assert.equal((await contracts.addAmendment(maria, id, { day: today, description: "", newValueCents: 600000 })).ok, false);
    assert.ok((await contracts.addAmendment(maria, id, { day: today, description: "Reajuste e renovação por 6 meses", newValueCents: 600000, newEndDate: "2027-05-31" })).ok);
    const c = (await contracts.getContract(eduardo, id))!;
    assert.equal(c.monthlyValueCents, 600000);
    assert.equal(c.endDate, "2027-05-31");
    assert.equal(c.amendments.length, 1);
    assert.equal(c.amendments[0].a.previousValueCents, 500000);
    assert.equal(c.amendments[0].a.previousEndDate, "2026-11-30");
    const [client] = await db.select().from(s.clients).where(eq(s.clients.id, otherClientId));
    assert.equal(client.monthlyValueCents, 600000);
    assert.equal((await contracts.deleteContract(maria, id, "")).ok, false);
    assert.ok((await contracts.deleteContract(maria, id, "cadastro de teste")).ok);
    assert.equal(await contracts.getContract(maria, id), null);
    const [row] = await db.select().from(s.contracts).where(eq(s.contracts.id, id));
    assert.ok(row.deletedAt, "exclusão lógica");
  });

  test("avisos de 30 e 7 dias viram demanda para o gestor, uma vez cada (inclusive em paralelo)", async () => {
    const created = await contracts.saveContract(maria, null, { clientId, services: "Contrato de teste de aviso", monthlyValueCents: 100000, startDate: addDays(today, -160), termMonths: 6, status: "active" });
    assert.ok(created.ok);
    const id = created.ok ? created.id : "";
    const end = (await contracts.getContract(maria, id))!.endDate!;
    await db.update(s.contracts).set({ endDate: addDays(today, 20) }).where(eq(s.contracts.id, id));
    assert.notEqual(end, "");
    const [a, b] = await Promise.all([contracts.generateContractAlerts(today), contracts.generateContractAlerts(today)]);
    assert.equal(a.created + b.created >= 1, true);
    const runs = (kind: string) => db.select().from(s.alertRuns).where(and(eq(s.alertRuns.kind, kind), eq(s.alertRuns.refKey, `${id}|${addDays(today, 20)}`)));
    assert.equal((await runs("contract_30")).length, 1);
    assert.equal((await runs("contract_7")).length, 0);
    assert.equal((await contracts.generateContractAlerts(today)).created, 0, "não repete");
    const [demand] = await db.select().from(s.demands).where(eq(s.demands.id, (await runs("contract_30"))[0].demandId));
    assert.match(demand.title, /^Contrato da AF Merchandising termina em /);
    assert.equal(demand.assigneeId, maria.id);
    // 14 dias depois faltam 6 dias: entra o aviso de 7.
    assert.ok((await contracts.generateContractAlerts(addDays(today, 14))).created >= 1, "outros contratos do banco de teste também podem entrar na janela");
    assert.equal((await runs("contract_7")).length, 1);
    assert.ok((await contracts.contractsEnding(maria, today)).some((c) => c.id === id));
    assert.deepEqual(await contracts.contractsEnding(tainara, today), []);
  });

  test("ganhar um lead cria o contrato em rascunho ligado ao contratante novo", async () => {
    const lead = await crm.createLead(eduardo, { company: "Agência Contrato Rascunho", type: "Agência de promotoria", source: "Prospecção ativa", ownerId: eduardo.id, products: ["App"], promoters: 10, nextAction: "Fazer o primeiro contato", nextActionDate: today });
    assert.ok(lead.ok);
    if (!lead.ok) return;
    const won = (await db.select().from(s.crmStages)).find((x) => x.key === "won")!;
    assert.ok((await crm.moveLead(eduardo, lead.id, won.id, { proposalValueCents: 60000 })).ok);
    const drafts = await db.select().from(s.contracts).where(eq(s.contracts.leadId, lead.id));
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].status, "draft");
    assert.equal(drafts[0].monthlyValueCents, 60000);
    assert.equal(drafts[0].services, "App");
  });
});

describe("documentos", () => {
  test("operacional envia e lê documento comum; restrito é só de gestor e dono, nem com o ID", async () => {
    const common = await documents.createDocument(tainara, { title: "Tabela de preço Fini nov", category: "Mix/Tabela de preço", clientId }, { name: "tabela.pdf", bytes: PDF });
    assert.ok(common.ok, common.ok ? "" : common.error);
    assert.equal((await documents.createDocument(tainara, { title: "Contrato enviado pela Tainara", category: "Contrato", clientId }, { name: "c.pdf", bytes: PDF })).ok, false);
    assert.equal((await documents.createDocument(tainara, { title: "RG do promotor Fulano", category: "Documento de promotor" }, { name: "rg.png", bytes: PNG })).ok, false);
    assert.equal((await documents.createDocument(tainara, { title: "Interno marcado restrito", category: "Interno", restricted: true }, { name: "i.pdf", bytes: PDF })).ok, false);

    const contract = await documents.createDocument(maria, { title: "Contrato AF assinado", category: "Contrato", clientId, restricted: false }, { name: "contrato.pdf", bytes: PDF });
    const promoter = await documents.createDocument(maria, { title: "RG do promotor Fulano", category: "Documento de promotor", promoter: "Fulano" }, { name: "rg.png", bytes: PNG });
    assert.ok(contract.ok && promoter.ok);
    if (!common.ok || !contract.ok || !promoter.ok) return;
    const [row] = await db.select().from(s.documents).where(eq(s.documents.id, contract.id));
    assert.equal(row.restricted, true, "Contrato é sempre restrito, mesmo sem marcar");

    const seen = (await documents.listDocuments(tainara)).map((r) => r.d.id);
    assert.ok(seen.includes(common.id) && !seen.includes(contract.id) && !seen.includes(promoter.id));
    assert.equal(await documents.getDocument(tainara, contract.id), null);
    assert.equal(await documents.readDocumentFile(tainara, contract.id), null, "download sem permissão falha mesmo com o ID certo");
    assert.equal(await documents.readDocumentFile(tainara, promoter.id), null);
    assert.equal((await documents.addDocumentVersion(tainara, contract.id, { name: "novo.pdf", bytes: PDF2 })).ok, false);
    assert.equal((await documents.updateDocument(tainara, common.id, { title: "Mudei o título", category: "Outros" })).ok, false);
    assert.equal((await documents.deleteDocument(tainara, common.id, "quero apagar")).ok, false);

    const mine = await documents.readDocumentFile(tainara, common.id);
    assert.deepEqual(mine?.bytes, PDF);
    assert.equal(mine?.contentType, "application/pdf");
    const before = (await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, contract.id), eq(s.auditLogs.action, "downloaded")))).length;
    assert.ok(await documents.readDocumentFile(maria, contract.id));
    assert.ok(await documents.readDocumentFile(eduardo, contract.id));
    const logs = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, contract.id), eq(s.auditLogs.action, "downloaded")));
    assert.equal(logs.length, before + 2, "todo download de documento restrito fica na auditoria");
    assert.deepEqual(logs.map((l) => l.userId).sort(), [maria.id, eduardo.id].sort());
    assert.equal((await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, common.id), eq(s.auditLogs.action, "downloaded")))).length, 0);
  });

  test("arquivo inválido não cria documento; sem armazenamento configurado o envio é recusado", async () => {
    const count = async () => (await db.select().from(s.documents)).length;
    const start = await count();
    assert.equal((await documents.createDocument(maria, { title: "Arquivo executável", category: "Outros" }, { name: "x.exe", bytes: PDF })).ok, false);
    assert.equal((await documents.createDocument(maria, { title: "PDF falso de teste", category: "Outros" }, { name: "x.pdf", bytes: text("oi") })).ok, false);
    assert.equal((await documents.createDocument(maria, { title: "ab", category: "Outros" }, { name: "x.pdf", bytes: PDF })).ok, false);
    assert.equal((await documents.createDocument(maria, { title: "Categoria inventada", category: "Segredo" }, { name: "x.pdf", bytes: PDF })).ok, false);
    storageMod.setStorageForTests(null);
    const off = await documents.createDocument(maria, { title: "Sem armazenamento", category: "Outros" }, { name: "x.pdf", bytes: PDF });
    assert.ok(!off.ok && /armazenamento/.test(off.error));
    storageMod.setStorageForTests({ put: async () => { throw new Error("bucket fora do ar"); }, get: async () => null });
    assert.equal((await documents.createDocument(maria, { title: "Falha no bucket", category: "Outros" }, { name: "x.pdf", bytes: PDF })).ok, false);
    storageMod.setStorageForTests(memory);
    assert.equal(await count(), start, "nenhum documento órfão ficou cadastrado");
  });

  test("versões: novo envio não sobrescreve; a anterior continua baixável", async () => {
    const doc = await documents.createDocument(maria, { title: "Sistemática Etros", category: "Sistemática", clientId: otherClientId }, { name: "sistematica.pdf", bytes: PDF });
    assert.ok(doc.ok);
    if (!doc.ok) return;
    assert.ok((await documents.addDocumentVersion(tainara, doc.id, { name: "sistematica-v2.pdf", bytes: PDF2 })).ok);
    assert.equal((await documents.addDocumentVersion(tainara, doc.id, { name: "x.exe", bytes: PDF2 })).ok, false);
    const full = (await documents.getDocument(tainara, doc.id))!;
    assert.equal(full.currentVersion, 2);
    assert.deepEqual(full.versions.map(({ v }) => v.version), [2, 1]);
    assert.notEqual(full.versions[0].v.storageKey, full.versions[1].v.storageKey);
    assert.deepEqual((await documents.readDocumentFile(tainara, doc.id))?.bytes, PDF2);
    assert.deepEqual((await documents.readDocumentFile(tainara, doc.id, 1))?.bytes, PDF);
    assert.equal(await documents.readDocumentFile(tainara, doc.id, 9), null);
    assert.equal(full.versions[0].v.sha256.length, 64);
  });

  test("gestor torna restrito e exclui (lógico); o arquivo continua guardado", async () => {
    const doc = await documents.createDocument(tainara, { title: "Comprovante de teste", category: "Comprovante", clientId }, { name: "c.png", bytes: PNG });
    assert.ok(doc.ok);
    if (!doc.ok) return;
    assert.ok((await documents.updateDocument(maria, doc.id, { title: "Comprovante de teste", category: "Comprovante", clientId, restricted: true })).ok);
    assert.equal(await documents.readDocumentFile(tainara, doc.id), null, "ficou restrito");
    const key = (await documents.getDocument(maria, doc.id))!.versions[0].v.storageKey;
    assert.equal((await documents.deleteDocument(maria, doc.id, "")).ok, false);
    assert.ok((await documents.deleteDocument(maria, doc.id, "enviado por engano")).ok);
    assert.equal(await documents.getDocument(maria, doc.id), null);
    assert.equal(await documents.readDocumentFile(maria, doc.id), null);
    assert.ok(files.has(key), "o arquivo não é apagado do bucket");
    const [row] = await db.select().from(s.documents).where(eq(s.documents.id, doc.id));
    assert.ok(row.deletedAt);
  });

  test("documento ligado a contrato herda o contratante; operacional não vincula a contrato", async () => {
    const [contract] = (await contracts.listContracts(maria, clientId)).map((r) => r.c);
    const doc = await documents.createDocument(maria, { title: "Aditivo assinado de teste", category: "Aditivo", contractId: contract.id }, { name: "aditivo.pdf", bytes: PDF });
    assert.ok(doc.ok);
    if (!doc.ok) return;
    assert.equal((await documents.getDocument(maria, doc.id))?.clientId, clientId);
    assert.ok((await documents.listDocuments(maria, { contractId: contract.id })).some((r) => r.d.id === doc.id));
    assert.equal((await documents.createDocument(tainara, { title: "Tentativa de vínculo", category: "Outros", contractId: contract.id }, { name: "x.pdf", bytes: PDF })).ok, false);
  });

  test("validade em até 30 dias vira demanda uma vez; título não revela documento restrito", async () => {
    const open = await documents.createDocument(maria, { title: "Alvará de teste", category: "Outros", clientId, expiresOn: addDays(today, 10) }, { name: "a.pdf", bytes: PDF });
    const secret = await documents.createDocument(maria, { title: "ASO do promotor Beltrano", category: "Documento de promotor", expiresOn: addDays(today, 5) }, { name: "aso.pdf", bytes: PDF });
    const far = await documents.createDocument(maria, { title: "Documento com validade longe", category: "Outros", expiresOn: addDays(today, 200) }, { name: "l.pdf", bytes: PDF });
    assert.ok(open.ok && secret.ok && far.ok);
    if (!open.ok || !secret.ok || !far.ok) return;
    assert.ok((await documents.generateDocumentAlerts(today)).created >= 2);
    assert.equal((await documents.generateDocumentAlerts(today)).created, 0);
    const run = async (id: string, days: number) => (await db.select().from(s.alertRuns).where(and(eq(s.alertRuns.kind, "document_expiry"), eq(s.alertRuns.refKey, `${id}|${addDays(today, days)}`))))[0];
    assert.equal(await run(far.id, 200), undefined);
    const [d1] = await db.select().from(s.demands).where(eq(s.demands.id, (await run(open.id, 10)).demandId));
    assert.match(d1.title, /Alvará de teste/);
    const [d2] = await db.select().from(s.demands).where(eq(s.demands.id, (await run(secret.id, 5)).demandId));
    assert.ok(!/Beltrano|ASO/.test(d2.title) && /Documento de promotor \(restrito\)/.test(d2.title));
    assert.ok((await documents.documentsExpiring(maria, today)).some((d) => d.id === secret.id));
    assert.ok(!(await documents.documentsExpiring(tainara, today)).some((d) => d.id === secret.id));
  });
});

describe("ficha operacional e rotas", () => {
  test("ficha recusa senha, guarda as seções fixas e só gestor/dono editam", async () => {
    assert.equal((await contracts.saveClientProfile(tainara, clientId, { pedidos: "Pelo portal" })).ok, false);
    const bad = await contracts.saveClientProfile(maria, clientId, { sistemas: "Portal AF — senha: Af@2026" });
    assert.ok(!bad.ok && /senha/i.test(bad.error));
    assert.ok((await contracts.saveClientProfile(maria, clientId, { pedidos: "Pelo portal, toda segunda", credenciais: "No cofre de senhas da Maria", inventada: "ignorar" })).ok);
    const [client] = await db.select().from(s.clients).where(eq(s.clients.id, clientId));
    assert.deepEqual(client.operationalProfile, { pedidos: "Pelo portal, toda segunda", credenciais: "No cofre de senhas da Maria" });
  });

  test("download: sem URL pública, 404 para quem não pode, sem cache e sem executar conteúdo", () => {
    const route = readFileSync("src/app/api/documentos/[id]/route.ts", "utf8");
    assert.match(route, /if \(!file\) return new Response\("Documento não encontrado\.", \{ status: 404/);
    assert.match(route, /no-store/);
    assert.match(route, /nosniff/);
    assert.match(route, /sandbox/);
    const storageSrc = readFileSync("src/server/storage.ts", "utf8");
    assert.ok(!/R2_ACCOUNT_ID(?!\b)|process\.env\.R2_/.test(storageSrc.replace(/OPS_R2_/g, "")), "o Operações não lê as variáveis de armazenamento do Campo");
    const r2 = readFileSync("src/server/r2.ts", "utf8");
    assert.ok(/OPS_R2_BUCKET/.test(r2) && !/env\.R2_/.test(r2) && !/SUPABASE/.test(r2 + storageSrc));
    assert.match(storageSrc, /NODE_ENV === "production"[^\n]*__opsStorage = null/, "produção sem R2 não grava em disco");
  });
});
