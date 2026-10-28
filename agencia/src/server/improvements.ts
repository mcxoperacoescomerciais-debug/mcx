/**
 * Solicitações de melhoria: grava o pedido, pede a análise ao Claude e avisa a
 * equipe MCX no WhatsApp. Sem ANTHROPIC_API_KEY o pedido é salvo e avisado do
 * mesmo jeito, com a análise marcada como "não feita".
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { SessionUser } from "./auth";
import { sendCallMeBot } from "./whatsapp-alert";
import { ROLE_LABEL } from "@/lib/domain";
import {
  ANALYSIS_SCHEMA,
  checkImprovementInput,
  ESFORCO_LABEL,
  FAZ_SENTIDO_LABEL,
  IMPACTO_LABEL,
  IMPROVEMENT_LIMITS,
  parseAnalysis,
  type ImprovementStatus,
} from "@/lib/improvements";

type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

const roleLabel = (u: Pick<SessionUser, "platform" | "role">) => (u.platform ? "Equipe MCX" : ROLE_LABEL[u.role]);

export async function createImprovement(user: SessionUser, i: { title: string; description: string; origin: string }): Promise<Result> {
  const check = checkImprovementInput(i);
  if (!check.ok) return check;
  const db = await getDb();
  const [row] = await db
    .insert(s.improvementRequests)
    .values({
      agencyId: user.agencyId,
      userId: user.id,
      userName: user.name,
      userRole: roleLabel(user),
      origin: i.origin.trim().slice(0, 200) || null,
      title: i.title.trim().slice(0, IMPROVEMENT_LIMITS.title),
      description: i.description.trim().slice(0, IMPROVEMENT_LIMITS.description),
    })
    .returning({ id: s.improvementRequests.id });
  return { ok: true, id: row.id, message: "Sugestão enviada. Obrigado! A equipe MCX vai avaliar." };
}

/** Pedidos da própria pessoa, com a situação e a resposta da MCX. */
export async function listMyImprovements(user: SessionUser) {
  const db = await getDb();
  return db
    .select({ id: s.improvementRequests.id, title: s.improvementRequests.title, status: s.improvementRequests.status, reply: s.improvementRequests.reply, createdAt: s.improvementRequests.createdAt })
    .from(s.improvementRequests)
    .where(eq(s.improvementRequests.userId, user.id))
    .orderBy(desc(s.improvementRequests.createdAt))
    .limit(30);
}

/* ------------------------------ equipe MCX ------------------------------ */

export async function listImprovements(user: SessionUser, status: ImprovementStatus | null) {
  if (!user.platform) return [];
  const db = await getDb();
  return db
    .select({ request: s.improvementRequests, agencyName: s.agencies.name })
    .from(s.improvementRequests)
    .innerJoin(s.agencies, eq(s.agencies.id, s.improvementRequests.agencyId))
    .where(status ? eq(s.improvementRequests.status, status) : undefined)
    .orderBy(desc(s.improvementRequests.createdAt))
    .limit(200);
}

/** Sugestões recebidas que a MCX ainda não avaliou (contador do menu). */
export async function countImprovementsToReview(user: SessionUser): Promise<number> {
  if (!user.platform) return 0;
  const db = await getDb();
  const [row] = await db.select({ n: count() }).from(s.improvementRequests).where(eq(s.improvementRequests.status, "new"));
  return row?.n ?? 0;
}

export async function getImprovement(user: SessionUser, id: string) {
  if (!user.platform || !isUuid(id)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ request: s.improvementRequests, agencyName: s.agencies.name })
    .from(s.improvementRequests)
    .innerJoin(s.agencies, eq(s.agencies.id, s.improvementRequests.agencyId))
    .where(eq(s.improvementRequests.id, id));
  return row ?? null;
}

export async function updateImprovement(user: SessionUser, id: string, i: { status: string; reply: string }): Promise<Result> {
  if (!user.platform || !isUuid(id)) return fail("Solicitação não encontrada.");
  const statuses: ImprovementStatus[] = ["new", "reviewing", "approved", "declined", "done"];
  const status = statuses.find((st) => st === i.status);
  if (!status) return fail("Situação inválida.");
  const db = await getDb();
  await db
    .update(s.improvementRequests)
    .set({ status, reply: i.reply.trim().slice(0, IMPROVEMENT_LIMITS.reply) || null, updatedAt: new Date() })
    .where(eq(s.improvementRequests.id, id));
  return { ok: true, message: "Salvo. Quem pediu vê a situação e a resposta." };
}

/* ------------------------- análise e aviso (MCX) ------------------------- */

const SYSTEM_PROMPT = `Você ajuda a equipe da MCX Operações Comerciais a avaliar pedidos de melhoria do MCX Trade, o sistema que a MCX oferece a agências de promotoria.

Sobre o MCX Trade:
- App do promotor no celular (funciona sem sinal e sincroniza depois): roteiro do dia, check-in na loja, atendimento por marca com fotos de antes e depois, estoque, ruptura, validade, avaria, ocorrências e histórico.
- Painel do gestor da agência: programação e roteiros, atendimentos por marca, central de pendências, relatório fotográfico, mapa ao vivo dos promotores, carteira e metas por loja e marca, degustações, financeiro (DRE, despesas fixas), parceiros de atendimento, cadastros (lojas, redes, marcas, produtos, usuários com perfis de acesso), importação por planilha, exportações em PDF, Excel e PowerPoint, auditoria e alertas de validade no WhatsApp.
- Visão MCX: a equipe MCX vê todas as agências, cria agências e envia escopos de serviço a potenciais clientes.
- Perfis: promotor, supervisor, gestor da agência e equipe MCX. Cada agência só vê os próprios dados.

Quem pede pode ser de qualquer perfil e escreve de forma informal. Avalie o pedido do ponto de vista da operação real das agências e da MCX: o que a pessoa quer resolver, se faz sentido, quem ganha, impacto, esforço de desenvolvimento, riscos (dados, uso no celular sem sinal, custo, segurança, regras entre agências) e o que falta perguntar. Se o sistema já faz algo parecido, diga onde. Não invente funcionalidades que não estão na lista acima. Escreva em português do Brasil, em frases curtas e sem jargão técnico, para uma gestora que não é programadora.`;

/** Pede a análise ao Claude e grava; nunca lança erro (falha fica registrada). */
export async function analyzeImprovement(id: string): Promise<void> {
  const db = await getDb();
  const [row] = await db
    .select({ request: s.improvementRequests, agencyName: s.agencies.name })
    .from(s.improvementRequests)
    .innerJoin(s.agencies, eq(s.agencies.id, s.improvementRequests.agencyId))
    .where(eq(s.improvementRequests.id, id));
  if (!row) return;
  const r = row.request;

  if (!process.env.ANTHROPIC_API_KEY) {
    await db.update(s.improvementRequests).set({ analysisStatus: "skipped", analysisError: "ANTHROPIC_API_KEY não configurada." }).where(eq(s.improvementRequests.id, id));
    return;
  }

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: ANALYSIS_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            `Agência: ${row.agencyName}`,
            `Quem pediu: ${r.userName} (${r.userRole})`,
            r.origin ? `Tela de onde enviou: ${r.origin}` : null,
            "",
            `<pedido>\nTítulo: ${r.title}\n\n${r.description}\n</pedido>`,
          ]
            .filter((l) => l !== null)
            .join("\n"),
        },
      ],
    });
    if (response.stop_reason === "refusal") throw new Error("O modelo recusou analisar este pedido.");
    const textBlock = response.content.find((b) => b.type === "text");
    const analysis = textBlock && textBlock.type === "text" ? parseAnalysis(JSON.parse(textBlock.text)) : null;
    if (!analysis) throw new Error(`Resposta fora do formato (${response.stop_reason ?? "sem motivo"}).`);
    await db
      .update(s.improvementRequests)
      .set({ analysisStatus: "done", analysis, analysisError: null, analyzedAt: new Date() })
      .where(eq(s.improvementRequests.id, id));
  } catch (err) {
    const message =
      err instanceof Anthropic.AuthenticationError
        ? "Chave da Anthropic inválida."
        : err instanceof Anthropic.RateLimitError
          ? "Limite de uso da Anthropic atingido; tente reanalisar mais tarde."
          : err instanceof Anthropic.APIError
            ? `Erro da Anthropic (${err.status ?? "rede"}).`
            : err instanceof Error
              ? err.message
              : "Falha desconhecida.";
    await db.update(s.improvementRequests).set({ analysisStatus: "failed", analysisError: message.slice(0, 300) }).where(eq(s.improvementRequests.id, id));
  }
}

function mcxRecipients() {
  const phones = (process.env.MCX_ALERT_WHATSAPP_PHONE || "").split(",").map((p) => p.trim()).filter(Boolean);
  const keys = (process.env.MCX_ALERT_WHATSAPP_APIKEY || "").split(",").map((k) => k.trim());
  return phones.map((phone, i) => ({ phone, apikey: keys[i] ?? keys[0] ?? "" })).filter((r) => r.apikey);
}

const appUrl = () => (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");

/** Avisa a equipe MCX no WhatsApp (uma vez por pedido). */
export async function notifyImprovement(id: string): Promise<void> {
  const to = mcxRecipients();
  if (!to.length) return;
  const db = await getDb();
  // Marca antes de enviar: dois avisos simultâneos não duplicam.
  const [row] = await db
    .update(s.improvementRequests)
    .set({ notifiedAt: new Date() })
    .where(and(eq(s.improvementRequests.id, id), isNull(s.improvementRequests.notifiedAt)))
    .returning();
  if (!row) return;
  const [agency] = await db.select({ name: s.agencies.name }).from(s.agencies).where(eq(s.agencies.id, row.agencyId));
  const a = row.analysis;
  const text = [
    `💡 *Nova sugestão de melhoria*`,
    `${row.userName} (${row.userRole}) · ${agency?.name ?? ""}`,
    `*${row.title}*`,
    a ? `Análise: ${FAZ_SENTIDO_LABEL[a.fazSentido]} · ${IMPACTO_LABEL[a.impacto]} · ${ESFORCO_LABEL[a.esforco]}` : "Análise automática indisponível.",
    a ? a.resumo : row.description.slice(0, 300),
    `${appUrl()}/painel/mcx/melhorias/${row.id}`,
  ].join("\n");
  for (const r of to) await sendCallMeBot(r.phone, r.apikey, text).catch(() => {});
}

/** Depois do envio: analisa e avisa (roda depois da resposta ao usuário). */
export async function processImprovement(id: string): Promise<void> {
  await analyzeImprovement(id);
  await notifyImprovement(id);
}
