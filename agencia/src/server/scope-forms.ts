/**
 * Escopos de serviço da MCX: a equipe MCX monta o checklist de cada cliente e
 * envia o link; o cliente responde sem login em /escopo/<token>.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { SessionUser } from "./auth";
import { checkResponse, LIMITS, normalizeSections, SCOPE_TEMPLATE_ADMIN, type ResponseInput, type ScopeSection } from "@/lib/scope-forms";

type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

const newToken = () => randomBytes(12).toString("base64url");
const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const clip = (v: string | null | undefined, max: number) => (v ?? "").trim().slice(0, max) || null;

/** Lista para o painel, com a resposta válida (a mais recente não reaberta). */
export async function listScopeForms(user: SessionUser) {
  if (!user.platform) return [];
  const db = await getDb();
  const forms = await db
    .select({ id: s.scopeForms.id, token: s.scopeForms.token, clientName: s.scopeForms.clientName, title: s.scopeForms.title, archivedAt: s.scopeForms.archivedAt, createdAt: s.scopeForms.createdAt, updatedAt: s.scopeForms.updatedAt })
    .from(s.scopeForms)
    .orderBy(desc(s.scopeForms.updatedAt));
  const responses = forms.length
    ? await db
        .select({ formId: s.scopeResponses.formId, submittedAt: s.scopeResponses.submittedAt, signerName: s.scopeResponses.signerName, answers: s.scopeResponses.answers })
        .from(s.scopeResponses)
        .where(and(inArray(s.scopeResponses.formId, forms.map((f) => f.id)), isNull(s.scopeResponses.supersededAt)))
    : [];
  const byForm = new Map(responses.map((r) => [r.formId, r]));
  return forms.map((f) => ({ ...f, response: byForm.get(f.id) ?? null }));
}

export async function getScopeForm(user: SessionUser, id: string) {
  if (!user.platform || !isUuid(id)) return null;
  const db = await getDb();
  const [form] = await db.select().from(s.scopeForms).where(eq(s.scopeForms.id, id));
  if (!form) return null;
  const responses = await db.select().from(s.scopeResponses).where(eq(s.scopeResponses.formId, id)).orderBy(desc(s.scopeResponses.submittedAt));
  return { form, current: responses.find((r) => !r.supersededAt) ?? null, previous: responses.filter((r) => r.supersededAt) };
}

/** Cria um escopo vazio, a partir do modelo ou como cópia de outro escopo. */
export async function createScopeForm(user: SessionUser, i: { clientName: string; base: string }): Promise<Result> {
  if (!user.platform) return fail("Somente a equipe MCX cria escopos.");
  const clientName = i.clientName.trim().slice(0, LIMITS.name);
  if (clientName.length < 2) return fail("Informe o nome do cliente.");
  const db = await getDb();
  let content: { title: string; intro: string | null; details: string | null; closingText: string | null; sections: ScopeSection[] } = {
    title: "Escopo de serviços",
    intro: null,
    details: null,
    closingText: "Revise e assinale os itens acima para confirmar as atividades que farão parte da prestação de serviços. Os pontos com ressalva serão alinhados antes da formalização do contrato.",
    sections: [],
  };
  if (i.base === "modelo-admin") {
    content = { ...SCOPE_TEMPLATE_ADMIN, sections: normalizeSections(SCOPE_TEMPLATE_ADMIN.sections) };
  } else if (isUuid(i.base)) {
    const [src] = await db.select().from(s.scopeForms).where(eq(s.scopeForms.id, i.base));
    if (!src) return fail("Escopo de origem não encontrado.");
    content = { title: src.title, intro: src.intro, details: src.details, closingText: src.closingText, sections: src.sections };
  }
  const [row] = await db
    .insert(s.scopeForms)
    .values({ token: newToken(), clientName, ...content, createdBy: user.id, updatedBy: user.id })
    .returning({ id: s.scopeForms.id });
  return { ok: true, id: row.id, message: "Escopo criado." };
}

export async function updateScopeForm(
  user: SessionUser,
  id: string,
  i: { clientName: string; title: string; intro: string; details: string; closingText: string; sections: unknown },
): Promise<Result> {
  if (!user.platform || !isUuid(id)) return fail("Escopo não encontrado.");
  const clientName = i.clientName.trim().slice(0, LIMITS.name);
  const title = i.title.trim().slice(0, LIMITS.title);
  if (clientName.length < 2) return fail("Informe o nome do cliente.");
  if (!title) return fail("Informe o título do escopo.");
  const sections = normalizeSections(i.sections);
  if (!sections.some((sec) => sec.items.length)) return fail("Inclua ao menos um item.");
  const db = await getDb();
  const r = await db
    .update(s.scopeForms)
    .set({
      clientName,
      title,
      intro: clip(i.intro, LIMITS.longText),
      details: clip(i.details, LIMITS.longText),
      closingText: clip(i.closingText, LIMITS.longText),
      sections,
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    .where(eq(s.scopeForms.id, id))
    .returning({ id: s.scopeForms.id });
  return r.length ? { ok: true, message: "Escopo salvo." } : fail("Escopo não encontrado.");
}

export async function setScopeArchived(user: SessionUser, id: string, archived: boolean): Promise<Result> {
  if (!user.platform || !isUuid(id)) return fail("Escopo não encontrado.");
  const db = await getDb();
  await db.update(s.scopeForms).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date(), updatedBy: user.id }).where(eq(s.scopeForms.id, id));
  return { ok: true, message: archived ? "Link desativado." : "Link reativado." };
}

/** Libera o link para uma nova resposta (a anterior fica no histórico). */
export async function reopenScopeForm(user: SessionUser, id: string): Promise<Result> {
  if (!user.platform || !isUuid(id)) return fail("Escopo não encontrado.");
  const db = await getDb();
  await db
    .update(s.scopeResponses)
    .set({ supersededAt: new Date() })
    .where(and(eq(s.scopeResponses.formId, id), isNull(s.scopeResponses.supersededAt)));
  return { ok: true, message: "Escopo reaberto: o cliente pode responder de novo pelo mesmo link." };
}

/* ---------------------------- página pública ---------------------------- */

const validToken = (token: string) => /^[A-Za-z0-9_-]{16}$/.test(token);

export async function getPublicScope(token: string) {
  if (!validToken(token)) return null;
  const db = await getDb();
  const [form] = await db.select().from(s.scopeForms).where(and(eq(s.scopeForms.token, token), isNull(s.scopeForms.archivedAt)));
  if (!form) return null;
  const [current] = await db
    .select()
    .from(s.scopeResponses)
    .where(and(eq(s.scopeResponses.formId, form.id), isNull(s.scopeResponses.supersededAt)))
    .orderBy(desc(s.scopeResponses.submittedAt))
    .limit(1);
  return { form, current: current ?? null };
}

export type SubmitResult = { ok: true } | { ok: false; error: string; missing?: string[] };

export async function submitScopeResponse(token: string, input: ResponseInput, userAgent: string | null): Promise<SubmitResult> {
  const found = await getPublicScope(token);
  if (!found) return { ok: false, error: "Este link não está mais disponível. Fale com a MCX." };
  if (found.current) return { ok: false, error: "Este escopo já foi respondido." };
  const { form } = found;
  const check = checkResponse(form.sections, input);
  if (!check.ok) return check;
  const db = await getDb();
  try {
    await db.insert(s.scopeResponses).values({
      formId: form.id,
      answers: check.answers,
      generalNote: clip(input.generalNote, LIMITS.longText),
      signerName: input.signerName.trim().slice(0, LIMITS.name),
      signerRole: input.signerRole.trim().slice(0, LIMITS.name),
      signerEmail: clip(input.signerEmail, LIMITS.name),
      snapshot: { title: form.title, intro: form.intro, details: form.details, closingText: form.closingText },
      userAgent: userAgent?.slice(0, 300) ?? null,
    });
  } catch {
    const again = await getPublicScope(token);
    return { ok: false, error: again?.current ? "Este escopo já foi respondido." : "Não foi possível enviar agora. Tente de novo em instantes." };
  }
  return { ok: true };
}
