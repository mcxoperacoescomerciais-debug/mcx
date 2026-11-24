/**
 * Ferramentas de CONSULTA do Assistente MCX. O modelo escolhe qual consulta
 * fazer e com quais filtros; quem busca os dados é este servidor, respeitando
 * as permissões de quem pergunta. Nenhuma ferramenta grava nada.
 *
 * - Operações: demandas (só as que a pessoa pode ver), comercial, contratos.
 * - Campo: só se CAMPO_READONLY_DATABASE_URL estiver configurada (papel
 *   somente leitura, ver ./campo-readonly.ts).
 */
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { addDays, isIsoDate, todayIso } from "@/lib/dates";
import { STATUS_LABEL, type Status } from "@/lib/domain";
import { can } from "@/lib/permissions";
import { CAMPO_DETAILS, campoConfigured, campoDetail, campoSummary, type CampoDetail } from "./campo-readonly";
import { contractsEnding } from "./contracts";
import { listLeads } from "./crm";
import { listDemands, type DemandRow } from "./demands";
import type { Actor } from "./demands";

type Tool = Anthropic.Beta.Messages.BetaTool;

const DATE = { type: "string", description: "Data no formato AAAA-MM-DD." } as const;

export function assistantTools(): Tool[] {
  const tools: Tool[] = [
    {
      name: "resumo_do_dia",
      description:
        "Resumo de um dia (padrão: hoje) para análise: demandas atrasadas, que vencem no dia, aguardando retorno com cobrança vencida, concluídas e criadas no dia, por responsável e por contratante; follow-ups comerciais vencidos; contratos vencendo; e, se a leitura do Campo estiver ligada, os números de campo do dia por agência (lojas programadas, visitas, lojas sem visita, rupturas, avarias, validades, ocorrências). Use primeiro quando perguntarem como foi o dia, o que precisa de atenção ou o que resolver amanhã.",
      input_schema: { type: "object", properties: { data: DATE }, additionalProperties: false },
    },
    {
      name: "buscar_demandas",
      description: "Lista demandas do MCX Operações com filtros. Devolve número, título, contratante, responsável, situação e prazo.",
      input_schema: {
        type: "object",
        properties: {
          situacao: { type: "string", enum: ["abertas", "atrasadas", "vencem_no_dia", "aguardando_retorno", "concluidas_no_dia", "a_distribuir"], description: "Recorte das demandas." },
          data: { ...DATE, description: "Dia de referência (padrão: hoje)." },
          contratante: { type: "string", description: "Parte do nome do contratante (ex.: Helvécio, AF, Etros)." },
          responsavel: { type: "string", description: "Parte do nome do responsável." },
          texto: { type: "string", description: "Palavras do título." },
          limite: { type: "integer", minimum: 1, maximum: 60 },
        },
        required: ["situacao"],
        additionalProperties: false,
      },
    },
  ];
  if (campoConfigured()) {
    tools.push(
      {
        name: "campo_resumo",
        description: "Números do MCX Campo (app dos promotores) por agência num período: lojas programadas, visitas concluídas/incompletas/em andamento, lojas programadas sem visita, rupturas, avarias, validades vencidas ou a vencer em 7 dias, ocorrências abertas e promotores que não abriram o app.",
        input_schema: { type: "object", properties: { de: DATE, ate: DATE, agencia: { type: "string", description: "Parte do nome da agência (ex.: AF, Etros)." } }, required: ["de", "ate"], additionalProperties: false },
      },
      {
        name: "campo_detalhe",
        description: "Lista detalhada do MCX Campo num período (até 50 linhas): lojas programadas sem visita, visitas, rupturas, avarias, validades (até 30 dias para vencer), ocorrências ou promotores sem sinal no último dia do período.",
        input_schema: {
          type: "object",
          properties: {
            tipo: { type: "string", enum: CAMPO_DETAILS },
            de: DATE,
            ate: DATE,
            agencia: { type: "string" },
            marca: { type: "string", description: "Parte do nome da marca." },
            limite: { type: "integer", minimum: 1, maximum: 50 },
          },
          required: ["tipo", "de", "ate"],
          additionalProperties: false,
        },
      },
    );
  }
  return tools;
}

/** Trecho do system prompt que explica as ferramentas (vai junto em toda conversa). */
export function toolsInstructions(today: string = todayIso()): string {
  return [
    `Hoje é ${today} (horário de Brasília).`,
    "Você tem ferramentas de CONSULTA aos dados do MCX (somente leitura). Quando a pergunta for sobre a operação — como foi o dia, o que está atrasado, o que resolver, números de campo —, consulte antes de responder e use só os números que vieram das ferramentas. Se uma ferramenta não trouxer o dado, diga que não há esse dado; não invente.",
    campoConfigured()
      ? "A leitura do MCX Campo (visitas, rupturas, avarias, validades, ocorrências, promotores) está ligada."
      : "A leitura do MCX Campo ainda NÃO está ligada: hoje você só vê os dados do MCX Operações (demandas, comercial, contratos). Se pedirem dado de campo, explique isso.",
    "Formato da análise: comece pelo que precisa de ação (o mais urgente primeiro, com responsável e contratante), depois os números do dia. Use listas curtas ou tabela. Você não pode executar ações; quando algo virar tarefa, sugira transformar em demanda.",
  ].join("\n");
}

const MAX_RESULT_CHARS = 14_000;
const json = (v: unknown) => {
  const s = JSON.stringify(v);
  return s.length > MAX_RESULT_CHARS ? `${s.slice(0, MAX_RESULT_CHARS)}… (resultado cortado; peça um filtro menor)` : s;
};
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const has = (hay: string | null | undefined, needle: string | undefined) => !needle || norm(hay ?? "").includes(norm(needle));
const day = (v: unknown, fallback: string) => (typeof v === "string" && isIsoDate(v) ? v : fallback);

function line(d: DemandRow) {
  return { numero: d.number, titulo: d.title, contratante: d.clientName, responsavel: d.assigneeName ?? "A distribuir", situacao: STATUS_LABEL[d.status as Status], prazo: d.dueDate, aguardando: d.waitingFor ?? undefined, cobrar_em: d.followUpDate ?? undefined };
}

function countBy<T>(rows: T[], key: (r: T) => string) {
  const out: Record<string, number> = {};
  for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + 1;
  return Object.entries(out).sort((a, b) => b[1] - a[1]).map(([nome, n]) => ({ nome, n }));
}

const completedOn = (d: DemandRow, ref: string) => !!d.completedAt && new Date(d.completedAt).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) === ref;

async function operationsDay(actor: Actor, ref: string) {
  const [open, done] = await Promise.all([listDemands(actor, { status: "open" }), listDemands(actor, { status: "done" })]);
  const late = open.filter((d) => d.dueDate && d.dueDate < ref);
  const dueToday = open.filter((d) => d.dueDate === ref);
  const waiting = open.filter((d) => d.status === "waiting" && (!d.followUpDate || d.followUpDate <= ref));
  const doneToday = done.filter((d) => completedOn(d, ref));
  const out: Record<string, unknown> = {
    dia: ref,
    escopo: can(actor.role, "demand.viewAll") ? "todas as demandas da equipe" : "só as demandas desta pessoa",
    demandas: {
      abertas: open.length,
      atrasadas: late.length,
      vencem_no_dia: dueToday.length,
      aguardando_retorno_para_cobrar: waiting.length,
      sem_responsavel: open.filter((d) => !d.assigneeId).length,
      concluidas_no_dia: doneToday.length,
      atrasadas_por_responsavel: countBy(late, (d) => d.assigneeName ?? "A distribuir"),
      atrasadas_por_contratante: countBy(late, (d) => d.clientName),
      lista_atrasadas: late.slice(0, 15).map(line),
      lista_vencem_no_dia: dueToday.slice(0, 15).map(line),
      lista_aguardando_para_cobrar: waiting.slice(0, 10).map(line),
      lista_concluidas_no_dia: doneToday.slice(0, 10).map((d) => ({ numero: d.number, titulo: d.title, contratante: d.clientName, responsavel: d.assigneeName })),
    },
  };
  if (can(actor.role, "crm.view")) {
    const leads = await listLeads(actor, { scope: "open" });
    const overdue = leads.filter((l) => l.nextActionDate && l.nextActionDate < ref);
    out.comercial = {
      leads_em_aberto: leads.length,
      follow_up_vencido: overdue.length,
      follow_up_no_dia: leads.filter((l) => l.nextActionDate === ref).length,
      lista_follow_up_vencido: overdue.slice(0, 10).map((l) => ({ empresa: l.company, etapa: l.stageName, proxima_acao: l.nextAction, data: l.nextActionDate, responsavel: l.ownerName })),
    };
  }
  if (can(actor.role, "contract.view")) {
    const ending = await contractsEnding(actor, ref);
    if (ending.length) out.contratos_vencendo_30_dias = ending.map((c) => ({ contratante: c.clientName, termina: c.endDate, renova_sozinho: c.autoRenew, ja_venceu: c.expired }));
  }
  return out;
}

async function searchDemands(actor: Actor, input: Record<string, unknown>) {
  const ref = day(input.data, todayIso());
  const kind = String(input.situacao ?? "abertas");
  const limit = Math.min(Math.max(Number(input.limite) || 30, 1), 60);
  const base = kind === "concluidas_no_dia" ? await listDemands(actor, { status: "done" }) : await listDemands(actor, { status: "open" });
  const rows = base
    .filter((d) => {
      if (kind === "atrasadas") return !!d.dueDate && d.dueDate < ref;
      if (kind === "vencem_no_dia") return d.dueDate === ref;
      if (kind === "aguardando_retorno") return d.status === "waiting";
      if (kind === "a_distribuir") return !d.assigneeId;
      if (kind === "concluidas_no_dia") return completedOn(d, ref);
      return true;
    })
    .filter((d) => has(d.clientName, input.contratante as string | undefined) && has(d.assigneeName, input.responsavel as string | undefined) && has(d.title, input.texto as string | undefined));
  return { total: rows.length, mostrando: Math.min(rows.length, limit), demandas: rows.slice(0, limit).map(line) };
}

function period(input: Record<string, unknown>) {
  const today = todayIso();
  let from = day(input.de, today);
  let to = day(input.ate, from);
  if (to < from) [from, to] = [to, from];
  if (from < addDays(to, -92)) from = addDays(to, -92);
  return { from, to };
}

/** Executa uma ferramenta e devolve o resultado em texto (JSON). Erros viram texto, não exceção. */
export async function runAssistantTool(actor: Actor, name: string, input: Record<string, unknown>): Promise<{ text: string; isError?: boolean }> {
  try {
    if (name === "resumo_do_dia") {
      const ref = day(input.data, todayIso());
      const ops = await operationsDay(actor, ref);
      const campo = campoConfigured() ? await campoSummary({ from: ref, to: ref }).catch((e: Error) => ({ erro: `Não consegui ler o Campo agora (${e.message.slice(0, 120)}).` })) : { aviso: "Leitura do MCX Campo ainda não ligada." };
      return { text: json({ operacoes: ops, campo }) };
    }
    if (name === "buscar_demandas") return { text: json(await searchDemands(actor, input)) };
    if (name === "campo_resumo" || name === "campo_detalhe") {
      if (!campoConfigured()) return { text: "Leitura do MCX Campo ainda não ligada.", isError: true };
      const { from, to } = period(input);
      const f = { from, to, agency: (input.agencia as string) ?? null, brand: (input.marca as string) ?? null, limit: Number(input.limite) || undefined };
      if (name === "campo_resumo") return { text: json({ periodo: { de: from, ate: to }, ...(await campoSummary(f)) }) };
      const kind = String(input.tipo) as CampoDetail;
      if (!CAMPO_DETAILS.includes(kind)) return { text: "Tipo inválido.", isError: true };
      const rows = await campoDetail(kind, f);
      return { text: json({ periodo: { de: from, ate: to }, tipo: kind, linhas: rows.length, dados: rows }) };
    }
    return { text: `Ferramenta desconhecida: ${name}`, isError: true };
  } catch (err) {
    return { text: `Não consegui consultar agora: ${(err as Error).message?.slice(0, 160) ?? "erro"}`, isError: true };
  }
}
