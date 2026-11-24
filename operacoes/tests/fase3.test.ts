/** Fase 3 — Comercial (CRM): preços, cadência, funil, follow-up obrigatório, WhatsApp, importação e painel. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import {
  appPriceCents,
  averageCycleDays,
  cadence,
  companyKey,
  contactsByWeek,
  fillTemplate,
  lossReasons,
  matchOption,
  LEAD_TYPES,
  leadFocus,
  normalizeLeadType,
  productsFromFocus,
  parseLeadsCsv,
  parseMoney,
  phoneDigits,
  pipeline,
  potentialValue,
  responseRate,
  stageConversion,
  tastingPriceCents,
  todayGroup,
  whatsappLink,
  type MetricLead,
} from "../src/lib/crm";
import { addDays, todayIso } from "../src/lib/dates";
import { can } from "../src/lib/permissions";
import type { Actor } from "../src/server/demands";
import type { LeadInput } from "../src/server/crm";

let db: DB;
let crm: typeof import("../src/server/crm");
let eduardo: Actor, maria: Actor, tainara: Actor;
let stage: (key: string) => string;
const today = todayIso();

const lead = (company: string, extra: Partial<LeadInput> = {}): LeadInput => ({ company, type: "Agência de promotoria", source: "Prospecção ativa", ownerId: eduardo.id, products: ["App"], promoters: 30, nextAction: "Fazer o primeiro contato", nextActionDate: today, ...extra });

async function newLead(company: string, extra: Partial<LeadInput> = {}): Promise<string> {
  const r = await crm.createLead(eduardo, lead(company, extra));
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r.ok ? r.id : "";
}

before(async () => {
  db = await memDb();
  crm = await import("../src/server/crm");
  const users = await db.select().from(s.users);
  const actor = (name: string): Actor => {
    const u = users.find((x) => x.username === name)!;
    return { id: u.id, role: u.role };
  };
  eduardo = actor("eduardo");
  maria = actor("maria");
  tainara = actor("tainara");
  const stages = await db.select().from(s.crmStages);
  stage = (key) => stages.find((x) => x.key === key)!.id;
});

describe("tabela de preços e utilidades", () => {
  test("app por faixa de promotores; degustação por faixa de ações", () => {
    assert.equal(appPriceCents(20), 20 * 6000);
    assert.equal(appPriceCents(21), 21 * 5500);
    assert.equal(appPriceCents(50), 50 * 5500);
    assert.equal(appPriceCents(51), 51 * 5000);
    assert.equal(tastingPriceCents(30), 59000);
    assert.equal(tastingPriceCents(31), 90000);
    assert.equal(tastingPriceCents(80), 120000);
    assert.equal(tastingPriceCents(81), 0);
  });
  test("potencial soma o que tem preço e separa o que é sob proposta (não inventa valor)", () => {
    const v = potentialValue(["Backoffice", "App", "Degustação", "Administrativo"], 30, 90);
    assert.equal(v.cents, 125000 + 30 * 5500);
    assert.equal(v.underProposal.length, 2);
    assert.equal(potentialValue(["App"], null, null).cents, 0);
  });
  test("telefone, empresa, dinheiro e link do WhatsApp", () => {
    assert.equal(phoneDigits("(31) 9 8888-7777"), "5531988887777");
    assert.equal(phoneDigits("+55 31 3333-4444"), "553133334444");
    assert.equal(phoneDigits("123"), null);
    assert.equal(companyKey("Agência São João Ltda."), "agencia sao joao");
    assert.equal(parseMoney("1.250,00"), 125000);
    assert.equal(parseMoney("1650"), 165000);
    assert.equal(parseMoney("abc"), null);
    assert.equal(whatsappLink("5531988887777", "Olá, Ana! Tudo bem?"), "https://wa.me/5531988887777?text=Ol%C3%A1%2C%20Ana!%20Tudo%20bem%3F");
  });
  test("modelo: variável sem valor continua visível", () => {
    assert.equal(fillTemplate("Oi, {nome} da {empresa} em {cidade}", { nome: "Ana", empresa: "Alfa", cidade: null }), "Oi, Ana da Alfa em {cidade}");
  });
  test("cadência D0 → D+3 → D+7 → sugere encerrar", () => {
    assert.deepEqual(cadence(1, "2026-11-20"), { nextAction: "Follow-up D+3", nextActionDate: "2026-11-23", suggestClose: false });
    assert.deepEqual(cadence(2, "2026-11-23"), { nextAction: "Follow-up D+7", nextActionDate: "2026-11-27", suggestClose: false });
    assert.equal(cadence(3, "2026-11-27").suggestClose, true);
    assert.equal(cadence(3, "2026-11-27").nextActionDate, "2026-12-27");
  });
  test("grupos do “Comercial hoje”", () => {
    const base = { stageKind: "open" as const, stageKey: "contacted", proposalValidUntil: null };
    assert.equal(todayGroup({ ...base, nextActionDate: addDays(today, -1) }, today), "overdue");
    assert.equal(todayGroup({ ...base, nextActionDate: today }, today), "today");
    assert.equal(todayGroup({ ...base, nextActionDate: addDays(today, 5) }, today), null);
    assert.equal(todayGroup({ ...base, stageKey: "proposal", nextActionDate: addDays(today, 5), proposalValidUntil: addDays(today, 2) }, today), "proposal");
    assert.equal(todayGroup({ ...base, stageKind: "lost", nextActionDate: addDays(today, -1) }, today), null);
  });
});

describe("acesso", () => {
  test("operacional não acessa o Comercial; gestor acessa, mas não gerencia", async () => {
    assert.equal(can("operacional", "crm.view"), false);
    assert.equal(can("gestor", "crm.view"), true);
    assert.equal(can("gestor", "crm.manage"), false);
    assert.equal(can("owner", "crm.manage"), true);
    const id = await newLead("Agência Acesso Restrito");
    assert.equal((await crm.createLead(tainara, lead("Agência da Tainara"))).ok, false);
    assert.deepEqual(await crm.listLeads(tainara), []);
    assert.equal(await crm.getLead(tainara, id), null);
    assert.equal(await crm.commercialDashboard(tainara, today), null);
    assert.deepEqual(await crm.listMessageTemplates(tainara), []);
    for (const attempt of [
      crm.moveLead(tainara, id, stage("lost"), { lossReason: "Preço" }),
      crm.addInteraction(tainara, id, { kind: "call", summary: "tentativa", outcome: "no_answer", nextAction: "x", nextActionDate: today }),
      crm.deleteLead(tainara, id, "motivo qualquer"),
      crm.importLeads(tainara, "empresa\nXis", { dryRun: false }),
      crm.setNextAction(tainara, id, "x", today),
    ]) {
      assert.equal((await attempt).ok, false);
    }
    assert.equal((await crm.saveStage(maria, null, { name: "Negociação", probability: 70 })).ok, false);
    assert.equal((await crm.setDailyGoal(maria, 8)).ok, false);
    assert.equal((await crm.createLead(eduardo, lead("Agência Dono Errado", { ownerId: tainara.id }))).ok, false, "responsável precisa ter acesso ao Comercial");
  });
  test("as páginas do Comercial exigem a permissão crm.view", () => {
    for (const page of ["page.tsx", "funil/page.tsx", "leads/page.tsx", "leads/novo/page.tsx", "leads/[id]/page.tsx", "painel/page.tsx", "importar/page.tsx", "config/page.tsx"]) {
      assert.match(readFileSync(`src/app/(app)/comercial/${page}`, "utf8"), /await requireCan\("crm\.view"\)/, page);
    }
  });
});

describe("lead e follow-up obrigatório", () => {
  test("lead aberto não salva sem próxima ação e data", async () => {
    assert.equal((await crm.createLead(eduardo, lead("Agência Sem Ação", { nextAction: "" }))).ok, false);
    assert.equal((await crm.createLead(eduardo, lead("Agência Sem Data", { nextActionDate: null }))).ok, false);
    assert.equal((await crm.createLead(eduardo, lead("Agência Indicada", { source: "Indicação" }))).ok, false, "indicação exige quem indicou");
    const id = await newLead("Agência Completa");
    assert.equal((await crm.updateLead(eduardo, id, lead("Agência Completa", { nextAction: " " }))).ok, false);
    assert.equal((await crm.setNextAction(eduardo, id, "", today)).ok, false);
    assert.ok((await crm.setNextAction(maria, id, "Ligar de novo", addDays(today, 2))).ok);
    const saved = await crm.getLead(eduardo, id);
    assert.equal(saved?.potentialCents, 30 * 5500, "potencial calculado pela tabela");
    assert.equal(saved?.stage.key, "prospect");
    assert.equal(saved?.nextActionDate, addDays(today, 2));
  });

  test("duplicata por WhatsApp ou nome da empresa avisa sem bloquear", async () => {
    await newLead("Agência Duplicada Um", { contact: { name: "Ana", whatsapp: "(31) 97777-0001" } });
    const byPhone = await crm.createLead(eduardo, lead("Outra Razão Social", { contact: { name: "Ana", whatsapp: "31977770001" } }));
    assert.ok(!byPhone.ok && byPhone.duplicate);
    const byName = await crm.createLead(eduardo, lead("agencia duplicada um ltda"));
    assert.ok(!byName.ok && byName.duplicate);
    assert.ok((await crm.createLead(eduardo, lead("agencia duplicada um ltda"), { confirmDuplicate: true })).ok);
    assert.equal((await crm.createLead(eduardo, lead("Agência Fone Torto", { contact: { name: "Zé", whatsapp: "123" } }))).ok, false);
  });

  test("interação pede a próxima ação, tira da lista e, se respondeu, leva para “Em conversa”", async () => {
    const id = await newLead("Agência Interação");
    assert.equal((await crm.addInteraction(eduardo, id, { kind: "call", summary: "Liguei, caixa postal", outcome: "no_answer" })).ok, false, "sem próxima ação");
    assert.ok((await crm.addInteraction(eduardo, id, { kind: "call", summary: "Liguei, caixa postal", outcome: "no_answer", nextAction: "Follow-up D+3", nextActionDate: addDays(today, 3) })).ok);
    let l = await crm.getLead(eduardo, id);
    assert.equal(l?.stage.key, "contacted");
    assert.ok(l?.firstContactAt);
    assert.equal(l?.respondedAt, null);
    assert.equal(l?.unanswered, 1);
    assert.ok((await crm.addInteraction(eduardo, id, { kind: "whatsapp", summary: "Respondeu, quer ver o painel", outcome: "answered", nextAction: "Agendar demonstração", nextActionDate: addDays(today, 1) })).ok);
    l = await crm.getLead(eduardo, id);
    assert.equal(l?.stage.key, "talking");
    assert.ok(l?.respondedAt);
    assert.equal(l?.history.length, 3, "histórico: entrou, contato feito, em conversa");
  });
});

describe("funil", () => {
  test("proposta exige valor; validade padrão de 10 dias", async () => {
    const id = await newLead("Agência Proposta", { products: [], promoters: null });
    assert.equal((await crm.moveLead(eduardo, id, stage("proposal"), { nextAction: "Cobrar retorno", nextActionDate: addDays(today, 3) })).ok, false);
    assert.ok((await crm.moveLead(eduardo, id, stage("proposal"), { nextAction: "Cobrar retorno", nextActionDate: addDays(today, 3), proposalValueCents: 165000 })).ok);
    const l = await crm.getLead(eduardo, id);
    assert.equal(l?.proposalValidUntil, addDays(today, 10));
    assert.equal(l?.proposalDate, today);
    assert.ok(l?.respondedAt && l.firstContactAt);
  });

  test("perdido exige motivo; nutrição exige data de retomada no futuro", async () => {
    const id = await newLead("Agência Perdida");
    assert.equal((await crm.moveLead(eduardo, id, stage("lost"))).ok, false);
    assert.equal((await crm.moveLead(eduardo, id, stage("lost"), { lossReason: "Motivo inventado" })).ok, false);
    assert.equal((await crm.moveLead(eduardo, id, stage("lost"), { lossReason: "Outro" })).ok, false, "Outro pede descrição");
    assert.ok((await crm.moveLead(eduardo, id, stage("lost"), { lossReason: "Preço" })).ok);
    let l = await crm.getLead(eduardo, id);
    assert.equal(l?.lossReason, "Preço");
    assert.equal(l?.nextAction, null);
    assert.ok(l?.lostAt);
    assert.equal((await crm.moveLead(eduardo, id, stage("nurture"), { resumeDate: today })).ok, false);
    assert.ok((await crm.moveLead(eduardo, id, stage("nurture"), { resumeDate: addDays(today, 30) })).ok);
    l = await crm.getLead(eduardo, id);
    assert.equal(l?.nextActionDate, addDays(today, 30));
    assert.equal(l?.lossReason, null);
    assert.equal(l?.lostAt, null);
    // Voltar para etapa aberta exige próxima ação (a de nutrição continua valendo).
    assert.ok((await crm.moveLead(eduardo, id, stage("talking"))).ok);
  });

  test("ganho cria o contratante, copia os contatos e abre a demanda de implantação (uma vez só)", async () => {
    const id = await newLead("Agência Ganha Exemplo", { contact: { name: "Bia", whatsapp: "31977770002" } });
    const r = await crm.moveLead(eduardo, id, stage("won"), { proposalValueCents: 180000 });
    assert.ok(r.ok, r.ok ? "" : r.error);
    const l = await crm.getLead(eduardo, id);
    assert.ok(l?.wonAt && l.wonClientId && l.wonDemandId);
    assert.equal(l?.nextAction, null);
    const [client] = await db.select().from(s.clients).where(eq(s.clients.id, l!.wonClientId!));
    assert.equal(client.name, "Agência Ganha Exemplo");
    assert.equal(client.kind, "agency");
    assert.equal(client.monthlyValueCents, 180000);
    const contacts = await db.select().from(s.clientContacts).where(eq(s.clientContacts.clientId, client.id));
    assert.equal(contacts[0]?.name, "Bia");
    const [demand] = await db.select().from(s.demands).where(eq(s.demands.id, l!.wonDemandId!));
    assert.equal(demand.title, "Implantação — Agência Ganha Exemplo");
    assert.equal(demand.clientId, client.id);
    assert.equal(demand.origin, "system");
    assert.equal((await crm.moveLead(eduardo, id, stage("talking"))).ok, false, "ganho não volta");
    assert.equal((await db.select().from(s.clients)).filter((c) => c.name === "Agência Ganha Exemplo").length, 1);
  });

  test("expansão: ganho em contratante existente não cria outro contratante", async () => {
    const existing = (await db.select().from(s.clients)).find((c) => c.name === "AF Merchandising")!;
    const before = (await db.select().from(s.clients)).length;
    const id = await newLead("AF — painel para as marcas", { clientId: existing.id, type: "Marca/Indústria" });
    assert.ok((await crm.moveLead(eduardo, id, stage("won"))).ok);
    const l = await crm.getLead(eduardo, id);
    assert.equal(l?.wonClientId, existing.id);
    assert.equal((await db.select().from(s.clients)).length, before);
  });

  test("etapas: só o dono edita; as iniciais não desativam; etapa nova entra antes de Ganho", async () => {
    assert.ok((await crm.saveStage(eduardo, null, { name: "Negociação", probability: 70 })).ok);
    const stages = await crm.listStages();
    const created = stages.find((x) => x.name === "Negociação")!;
    const won = stages.find((x) => x.kind === "won")!;
    assert.ok(created.position < won.position);
    assert.equal(new Set(stages.map((x) => x.position)).size, stages.length, "posições sem repetição");
    assert.equal((await crm.saveStage(eduardo, stage("proposal"), { name: "Proposta", probability: 60, active: false })).ok, false);
    assert.ok((await crm.saveStage(eduardo, created.id, { name: "Negociação", probability: 70, active: false })).ok);
    assert.ok((await crm.setDailyGoal(eduardo, 8)).ok);
    assert.equal(await crm.dailyGoal(), 8);
    assert.ok((await crm.setDailyGoal(eduardo, 5)).ok);
  });
});

describe("WhatsApp, modelos e LGPD", () => {
  test("abrir no WhatsApp monta o link, registra a interação e respeita o opt-out", async () => {
    const id = await newLead("Agência Zap", { city: "Contagem", contact: { name: "Carla Souza", whatsapp: "31977770003" } });
    let l = (await crm.getLead(eduardo, id))!;
    const contact = l.contacts[0];
    const [{ t: tpl }] = await crm.listMessageTemplates(eduardo);
    const text = crm.renderForLead(tpl.body, l, contact.name);
    assert.ok(text.includes("Carla") && text.includes("Agência Zap") && !text.includes("{"));
    assert.equal((await crm.openWhatsapp(eduardo, id, { contactId: contact.id, text: "Oi, {nome}", nextAction: "Follow-up D+3", nextActionDate: addDays(today, 3) })).ok, false, "variável sem preencher");
    assert.equal((await crm.openWhatsapp(eduardo, id, { contactId: contact.id, text })).ok, false, "sem próxima ação");
    const r = await crm.openWhatsapp(eduardo, id, { contactId: contact.id, templateId: tpl.id, text, nextAction: "Follow-up D+3", nextActionDate: addDays(today, 3) });
    assert.ok(r.ok && r.url.startsWith("https://wa.me/5531977770003?text="));
    l = (await crm.getLead(eduardo, id))!;
    assert.equal(l.interactions.length, 1);
    assert.equal(l.interactions[0].i.outcome, "sent");
    assert.equal(l.stage.key, "contacted");
    assert.ok((await crm.setContactOptOut(eduardo, contact.id, true)).ok);
    assert.equal((await crm.openWhatsapp(eduardo, id, { contactId: contact.id, text, nextAction: "x", nextActionDate: today })).ok, false, "opt-out bloqueia");
  });

  test("modelos iniciais são rascunho a validar; só o dono aprova; variável desconhecida é recusada", async () => {
    const all = await crm.listMessageTemplates(maria);
    assert.ok(all.length >= 8);
    assert.ok(all.every(({ t }) => t.status === "draft" && t.toValidate));
    const { t } = all[0];
    assert.ok((await crm.saveMessageTemplate(maria, t.id, { name: t.name, stageId: t.stageId, body: t.body, status: "approved" })).ok);
    assert.equal((await crm.listMessageTemplates(maria)).find((x) => x.t.id === t.id)?.t.status, "draft", "gestor não aprova");
    assert.ok((await crm.saveMessageTemplate(eduardo, t.id, { name: t.name, stageId: t.stageId, body: t.body, status: "approved" })).ok);
    const approved = (await crm.listMessageTemplates(maria)).find((x) => x.t.id === t.id)!.t;
    assert.equal(approved.status, "approved");
    assert.equal(approved.toValidate, false);
    assert.equal((await crm.saveMessageTemplate(eduardo, null, { name: "Com erro", body: "Olá {fulano}, tudo bem por aí?" })).ok, false);
  });

  test("nada é enviado sozinho: a fila de automação existe e fica vazia", async () => {
    assert.equal((await db.select().from(s.outboundMessages)).length, 0);
    const src = readFileSync("src/server/crm.ts", "utf8");
    assert.ok(!/insert\(s\.outboundMessages\)/.test(src), "nenhum código enfileira mensagem nesta fase");
    assert.ok(!/fetch\(/.test(src), "o CRM não chama serviço externo");
  });

  test("excluir contato apaga o dado de verdade; excluir lead exige motivo e apaga os contatos", async () => {
    const id = await newLead("Agência LGPD", { contact: { name: "Dani Privada", whatsapp: "31977770004" } });
    const l = (await crm.getLead(eduardo, id))!;
    assert.ok((await crm.addLeadContact(eduardo, id, { name: "Segundo Contato", email: "x@exemplo.com" })).ok);
    assert.ok((await crm.removeLeadContact(eduardo, l.contacts[0].id)).ok);
    assert.equal((await db.select().from(s.leadContacts).where(eq(s.leadContacts.id, l.contacts[0].id))).length, 0);
    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, l.contacts[0].id));
    assert.ok(logs.length === 1 && !JSON.stringify(logs).includes("Dani"), "auditoria sem o nome do titular");
    assert.equal((await crm.deleteLead(eduardo, id, "")).ok, false);
    assert.ok((await crm.deleteLead(eduardo, id, "pedido do titular")).ok);
    assert.equal(await crm.getLead(eduardo, id), null);
    assert.equal((await db.select().from(s.leadContacts).where(eq(s.leadContacts.leadId, id))).length, 0);
  });
});

describe("importação de CSV", () => {
  test("lê ; ou , com aspas e reconhece o cabeçalho", () => {
    const a = parseLeadsCsv("Empresa;Contato;WhatsApp;Cidade;Tipo;Origem\nAlfa;Ana;31 97777-1111;BH;Representante;Evento\n\n");
    assert.equal(a.rows.length, 1);
    assert.deepEqual(
      { ...a.rows[0] },
      { line: 2, company: "Alfa", contact: "Ana", whatsapp: "31 97777-1111", city: "BH", type: "Representante", source: "Evento", region: "", focus: "", nextAction: "", dataSource: "", fit: "", why: "", notes: "", instagram: "", site: "", address: "" },
    );
    const b = parseLeadsCsv('empresa,cidade\n"Beta, Filial",Betim');
    assert.equal(b.rows[0].company, "Beta, Filial");
    assert.ok(parseLeadsCsv("nome;cidade\nx;y").error);
    assert.equal(matchOption("representante", LEAD_TYPES, "Outro"), "Representante");
    assert.equal(matchOption("", LEAD_TYPES, "Agência de promotoria"), "Agência de promotoria");
  });

  test("prévia não grava; importação pula duplicatas (banco e arquivo) e não duplica ao repetir", async () => {
    await newLead("Agência Já Cadastrada");
    const csv = "empresa;contato;whatsapp;cidade\nImportada Um;Ana;31977771001;BH\nImportada Dois;;;Betim\nAgência Já Cadastrada;;;\nimportada um;Outra;;";
    const count = async () => (await db.select().from(s.leads)).length;
    const start = await count();
    const preview = await crm.importLeads(eduardo, csv, { dryRun: true });
    assert.ok(preview.ok);
    assert.equal(await count(), start, "prévia não grava");
    if (preview.ok) assert.deepEqual(preview.rows.map((r) => !!r.duplicateOf), [false, false, true, true]);
    const done = await crm.importLeads(eduardo, csv, { dryRun: false });
    assert.ok(done.ok && done.created === 2 && done.skipped === 2);
    assert.equal(await count(), start + 2);
    const again = await crm.importLeads(eduardo, csv, { dryRun: false });
    assert.ok(again.ok && again.created === 0);
    assert.equal(await count(), start + 2);
    const imported = (await crm.listLeads(eduardo, { q: "importada um" }))[0];
    assert.equal(imported.stageKey, "prospect");
    assert.equal(imported.nextActionDate, today);
    assert.equal(imported.contactName, "Ana");
  });

  test("planilha de prospecção: tipo, foco (app ou serviço), região, próximo passo e contexto nas observações", async () => {
    assert.deepEqual(productsFromFocus("Venda do aplicativo: agenda de degustações, painel financeiro e calculadora"), ["App"]);
    assert.deepEqual(productsFromFocus("App + serviço"), ["App", "Backoffice"]);
    assert.deepEqual(productsFromFocus("Serviço"), ["Backoffice"]);
    assert.equal(leadFocus(["App"]), "Venda do app");
    assert.equal(leadFocus(["Degustação"]), "Serviço");
    assert.equal(leadFocus(["App", "Backoffice"]), "App + serviço");
    assert.equal(leadFocus([]), null);
    assert.equal(normalizeLeadType("Agência de degustação/ação"), "Agência de ativação/promoções");
    const csv = [
      "Agência;Cidade;Região;Telefone;Instagram;Site;Fit;Tipo;Foco;Por que é lead;Próximo passo;Endereço;Fonte;Observação",
      "Promo Teste Alfa;Uberlândia;Triângulo;(34) 99161-1697;https://instagram.com/x;Não encontrado;A;Agência de ativação/promoções;Venda do aplicativo;Promoções;Perguntar quantas ações fazem;R. Um, 1;Google Maps;",
      "Promotoria Teste Beta;Juiz de Fora;Zona da Mata;(32) 3216-7548;Não encontrado;;B;Agência de promotoria;App + serviço;Promotores em PDV;Ligar;;Google Maps;Alinhar antes",
    ].join("\n");
    const done = await crm.importLeads(eduardo, csv, { dryRun: false });
    assert.ok(done.ok && done.created === 2, JSON.stringify(done));
    const alfa = (await crm.listLeads(eduardo, { q: "promo teste alfa" }))[0];
    assert.equal(alfa.type, "Agência de ativação/promoções");
    assert.equal(alfa.focus, "Venda do app");
    assert.equal(alfa.nextAction, "Perguntar quantas ações fazem");
    const full = (await crm.getLead(eduardo, alfa.id))!;
    assert.equal(full.region, "Triângulo");
    assert.deepEqual(full.tags, ["Fit A"]);
    assert.match(full.notes ?? "", /Instagram: https:\/\/instagram\.com\/x/);
    assert.doesNotMatch(full.notes ?? "", /Não encontrado/);
    assert.equal(full.dataSource, "Planilha (Google Maps)");
    const servico = await crm.listLeads(eduardo, { focus: "App + serviço", type: "Agência de promotoria" });
    assert.ok(servico.some((l) => l.company === "Promotoria Teste Beta"));
    assert.ok(!servico.some((l) => l.company === "Promo Teste Alfa"));
    assert.ok((await crm.listLeads(eduardo, { focus: "none" })).every((l) => l.focus === null));
  });
});

describe("Comercial hoje e painel", () => {
  test("vencidos, de hoje, propostas vencendo e contagem da meta", async () => {
    const overdue = await newLead("Agência Vencida", { nextActionDate: addDays(today, -2) });
    const due = await newLead("Agência De Hoje");
    const prop = await newLead("Agência Proposta Vencendo");
    assert.ok((await crm.moveLead(eduardo, prop, stage("proposal"), { nextAction: "Cobrar", nextActionDate: addDays(today, 5), proposalValueCents: 100000, proposalDate: addDays(today, -8), proposalValidUntil: addDays(today, 2) })).ok);
    const data = await crm.commercialToday(eduardo, eduardo.id);
    assert.ok(data.overdue.some((l) => l.id === overdue));
    assert.ok(data.dueToday.some((l) => l.id === due));
    assert.ok(data.proposal.some((l) => l.id === prop));
    const before = data.contactsToday;
    assert.ok((await crm.addInteraction(eduardo, due, { kind: "call", summary: "Primeiro contato", outcome: "no_answer", nextAction: "Follow-up D+3", nextActionDate: addDays(today, 3) })).ok);
    assert.equal((await crm.commercialToday(eduardo, eduardo.id)).contactsToday, before + 1);
    assert.equal((await crm.commercialToday(maria, maria.id)).overdue.length, 0, "filtro por responsável");
  });

  test("cálculos do painel", () => {
    const base: MetricLead = { id: "a", type: "Agência", source: "Indicação", stageKind: "open", stageProbability: 50, valueCents: 100000, firstContactDay: "2026-11-03", respondedDay: null, wonDay: null, lostDay: null, lossReason: null };
    const leads: MetricLead[] = [
      base,
      { ...base, id: "b", respondedDay: "2026-11-05", stageKind: "won", stageProbability: 100, wonDay: "2026-11-13", valueCents: 200000 },
      { ...base, id: "c", firstContactDay: "2026-11-10", stageKind: "lost", stageProbability: 0, lostDay: "2026-11-12", lossReason: "Preço" },
      { ...base, id: "d", firstContactDay: null, stageProbability: 10, valueCents: 50000 },
    ];
    assert.deepEqual(responseRate(leads, "2026-11-01", "2026-11-30"), { contacted: 3, answered: 1, percent: 33 });
    assert.deepEqual(contactsByWeek(leads, ["2026-11-02", "2026-11-09"], 5), [{ week: "2026-11-02", contacts: 2, goal: 25 }, { week: "2026-11-09", contacts: 1, goal: 25 }]);
    assert.deepEqual(pipeline(leads), { count: 2, totalCents: 150000, weightedCents: 55000 });
    assert.equal(averageCycleDays(leads, "2026-11-01", "2026-11-30"), 10);
    assert.deepEqual(lossReasons(leads, "2026-11-01", "2026-11-30"), [{ reason: "Preço", count: 1 }]);
    const conv = stageConversion(
      [
        { leadId: "a", toKey: "prospect", toPosition: 0, day: "2026-11-01" },
        { leadId: "b", toKey: "prospect", toPosition: 0, day: "2026-11-01" },
        { leadId: "b", toKey: "proposal", toPosition: 2, day: "2026-11-08" },
      ],
      [{ name: "A prospectar", position: 0 }, { name: "Contato", position: 1 }, { name: "Proposta", position: 2 }],
    );
    assert.deepEqual(conv.map((c) => [c.count, c.percentFromPrevious]), [[2, null], [1, 50], [1, 100]]);
  });

  test("painel do mês lê o banco sem erro e não conta lead excluído", async () => {
    const data = await crm.commercialDashboard(maria, today);
    assert.ok(data && data.total > 0 && data.weeks.length === 4);
    assert.ok(data.won.count >= 2 && data.pipeline.count > 0);
    assert.ok(data.conversion.length >= 7);
    const id = await newLead("Agência Para Excluir");
    const mid = (await crm.commercialDashboard(maria, today))!.total;
    assert.ok((await crm.deleteLead(eduardo, id, "cadastro errado")).ok);
    assert.equal((await crm.commercialDashboard(maria, today))!.total, mid - 1);
  });
});
