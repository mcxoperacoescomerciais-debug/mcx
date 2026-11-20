/**
 * Repositório de documentos. Regras:
 * - arquivo validado pelo nome E pelo conteúdo; limite de tamanho;
 * - cada novo upload do mesmo documento é uma versão; nada é sobrescrito;
 * - Contrato e Documento de promotor são sempre restritos (só gestor e dono);
 * - o operacional não lista, não lê nem baixa documento restrito, nem com o ID;
 * - download de documento restrito grava auditoria;
 * - exclusão é lógica; o arquivo continua guardado.
 */
import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { addDays, formatBr, isIsoDate, todayIso } from "@/lib/dates";
import { ALWAYS_RESTRICTED, checkFile, DOCUMENT_CATEGORIES, storageKey } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { audit } from "./audit";
import { openAlertDemand } from "./contracts";
import { getDb, schema as s } from "./db";
import type { Actor, Result } from "./demands";
import { storage } from "./storage";

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const UUID = /^[0-9a-f-]{36}$/i;
const clean = (v: string | null | undefined, max = 160) => (v ?? "").trim().slice(0, max) || null;
const NO_STORAGE = "O envio de arquivos ainda não está ligado: falta configurar o armazenamento (bucket R2 do Operações).";

export interface DocumentMeta {
  title: string;
  category: string;
  clientId?: string | null;
  contractId?: string | null;
  brand?: string | null;
  promoter?: string | null;
  restricted?: boolean;
  expiresOn?: string | null;
}

export interface UploadFile {
  name: string;
  bytes: Uint8Array;
}

const canRead = (actor: Actor, doc: { restricted: boolean }) => can(actor.role, "document.view") && (!doc.restricted || can(actor.role, "document.restricted"));

async function checkMeta(actor: Actor, meta: DocumentMeta): Promise<{ ok: true; values: { title: string; category: string; clientId: string | null; contractId: string | null; brand: string | null; promoter: string | null; restricted: boolean; expiresOn: string | null } } | { ok: false; error: string }> {
  const title = clean(meta.title, 160);
  if (!title || title.length < 3) return fail("Informe o título do documento.");
  if (!(DOCUMENT_CATEGORIES as readonly string[]).includes(meta.category)) return fail("Escolha a categoria.");
  const restricted = ALWAYS_RESTRICTED.includes(meta.category) || !!meta.restricted;
  if (restricted && !can(actor.role, "document.restricted")) return fail("Contrato, documento de promotor e documentos restritos são enviados pelo gestor ou pelo dono.");
  const expiresOn = meta.expiresOn || null;
  if (expiresOn && !isIsoDate(expiresOn)) return fail("Data de validade inválida.");
  const db = await getDb();
  let clientId = meta.clientId && UUID.test(meta.clientId) ? meta.clientId : null;
  const contractId = meta.contractId && UUID.test(meta.contractId) ? meta.contractId : null;
  if (contractId) {
    if (!can(actor.role, "contract.view")) return fail("Sem permissão para vincular a um contrato.");
    const [contract] = await db.select({ clientId: s.contracts.clientId }).from(s.contracts).where(and(eq(s.contracts.id, contractId), isNull(s.contracts.deletedAt)));
    if (!contract) return fail("Contrato não encontrado.");
    clientId = contract.clientId;
  }
  if (clientId) {
    const [client] = await db.select({ id: s.clients.id }).from(s.clients).where(and(eq(s.clients.id, clientId), isNull(s.clients.deletedAt)));
    if (!client) return fail("Contratante não encontrado.");
  }
  return { ok: true, values: { title, category: meta.category, clientId, contractId, brand: clean(meta.brand, 80), promoter: clean(meta.promoter, 120), restricted, expiresOn } };
}

async function storeVersion(actor: Actor, doc: { id: string; clientId: string | null }, version: number, file: UploadFile): Promise<{ ok: true } | { ok: false; error: string }> {
  const checked = checkFile(file.name, file.bytes);
  if (!checked.ok) return checked;
  const driver = storage();
  if (!driver) return fail(NO_STORAGE);
  const key = storageKey(doc.clientId, doc.id, version, checked.fileName);
  await driver.put(key, file.bytes, checked.contentType);
  const db = await getDb();
  await db.insert(s.documentVersions).values({ documentId: doc.id, version, storageKey: key, fileName: checked.fileName, contentType: checked.contentType, size: file.bytes.length, sha256: createHash("sha256").update(file.bytes).digest("hex"), uploadedBy: actor.id });
  return { ok: true };
}

export async function createDocument(actor: Actor, meta: DocumentMeta, file: UploadFile): Promise<Result<{ id: string }>> {
  if (!can(actor.role, "document.upload")) return fail("Sem permissão.");
  const checkedMeta = await checkMeta(actor, meta);
  if (!checkedMeta.ok) return checkedMeta;
  const checkedFile = checkFile(file.name, file.bytes);
  if (!checkedFile.ok) return checkedFile;
  if (!storage()) return fail(NO_STORAGE);
  const db = await getDb();
  const [doc] = await db.insert(s.documents).values({ ...checkedMeta.values, currentVersion: 1, createdBy: actor.id }).returning({ id: s.documents.id, clientId: s.documents.clientId });
  const stored = await storeVersion(actor, doc, 1, file).catch((err: Error) => fail(`Não foi possível guardar o arquivo: ${err.message}`));
  if (!stored.ok) {
    // Sem arquivo não existe documento: desfaz o cadastro (nenhuma versão foi gravada).
    await db.delete(s.documents).where(eq(s.documents.id, doc.id));
    return stored;
  }
  await audit(actor.id, "document", doc.id, "created", { after: { category: checkedMeta.values.category, restricted: checkedMeta.values.restricted, fileName: checkedFile.fileName } });
  return { ok: true, id: doc.id, message: "Documento enviado." };
}

/** Novo upload do mesmo documento = nova versão; as anteriores continuam guardadas. */
export async function addDocumentVersion(actor: Actor, documentId: string, file: UploadFile): Promise<Result> {
  if (!can(actor.role, "document.upload") || !UUID.test(documentId)) return fail("Sem permissão.");
  const db = await getDb();
  const [doc] = await db.select().from(s.documents).where(and(eq(s.documents.id, documentId), isNull(s.documents.deletedAt)));
  if (!doc || !canRead(actor, doc)) return fail("Documento não encontrado.");
  const version = doc.currentVersion + 1;
  const stored = await storeVersion(actor, doc, version, file).catch((err: Error) => fail(`Não foi possível guardar o arquivo: ${err.message}`));
  if (!stored.ok) return stored;
  await db.update(s.documents).set({ currentVersion: version, updatedAt: new Date() }).where(eq(s.documents.id, documentId));
  await audit(actor.id, "document", documentId, "version_added", { after: { version } });
  return { ok: true, message: `Versão ${version} enviada.` };
}

export async function listDocuments(actor: Actor, f: { clientId?: string; contractId?: string; category?: string; q?: string } = {}) {
  if (!can(actor.role, "document.view")) return [];
  const db = await getDb();
  const where = [isNull(s.documents.deletedAt)];
  if (!can(actor.role, "document.restricted")) where.push(eq(s.documents.restricted, false));
  if (f.clientId && UUID.test(f.clientId)) where.push(eq(s.documents.clientId, f.clientId));
  if (f.contractId && UUID.test(f.contractId)) where.push(eq(s.documents.contractId, f.contractId));
  if (f.category) where.push(eq(s.documents.category, f.category));
  const q = (f.q ?? "").trim().toLowerCase();
  if (q) where.push(sql`lower(${s.documents.title}) like ${`%${q}%`}`);
  return db
    .select({ d: s.documents, clientName: s.clients.name, fileName: s.documentVersions.fileName, size: s.documentVersions.size, contentType: s.documentVersions.contentType })
    .from(s.documents)
    .leftJoin(s.clients, eq(s.clients.id, s.documents.clientId))
    .leftJoin(s.documentVersions, and(eq(s.documentVersions.documentId, s.documents.id), eq(s.documentVersions.version, s.documents.currentVersion)))
    .where(and(...where))
    .orderBy(desc(s.documents.updatedAt));
}

export async function getDocument(actor: Actor, id: string) {
  if (!can(actor.role, "document.view") || !UUID.test(id)) return null;
  const db = await getDb();
  const [doc] = await db.select().from(s.documents).where(and(eq(s.documents.id, id), isNull(s.documents.deletedAt)));
  if (!doc || !canRead(actor, doc)) return null;
  const [versions, [client]] = await Promise.all([
    db.select({ v: s.documentVersions, userName: s.users.name }).from(s.documentVersions).innerJoin(s.users, eq(s.users.id, s.documentVersions.uploadedBy)).where(eq(s.documentVersions.documentId, id)).orderBy(desc(s.documentVersions.version)),
    doc.clientId ? db.select({ name: s.clients.name }).from(s.clients).where(eq(s.clients.id, doc.clientId)) : [],
  ]);
  return { ...doc, clientName: client?.name ?? null, versions };
}

/**
 * Bytes do arquivo para a rota de download. Confere a permissão a cada acesso:
 * sem permissão devolve null, igual a "não existe" (não revela que o ID é válido).
 */
export async function readDocumentFile(actor: Actor, id: string, version?: number): Promise<{ bytes: Uint8Array; fileName: string; contentType: string } | null> {
  const doc = await getDocument(actor, id);
  if (!doc) return null;
  const wanted = version ?? doc.currentVersion;
  const row = doc.versions.find(({ v }) => v.version === wanted);
  const driver = storage();
  if (!row || !driver) return null;
  const bytes = await driver.get(row.v.storageKey);
  if (!bytes) return null;
  if (doc.restricted) await audit(actor.id, "document", id, "downloaded", { after: { version: wanted } });
  return { bytes, fileName: row.v.fileName, contentType: row.v.contentType };
}

export async function updateDocument(actor: Actor, id: string, meta: DocumentMeta): Promise<Result> {
  if (!can(actor.role, "document.manage") || !UUID.test(id)) return fail("Só o gestor e o dono editam os dados de um documento.");
  const db = await getDb();
  const [doc] = await db.select().from(s.documents).where(and(eq(s.documents.id, id), isNull(s.documents.deletedAt)));
  if (!doc) return fail("Documento não encontrado.");
  const checked = await checkMeta(actor, meta);
  if (!checked.ok) return checked;
  await db.update(s.documents).set({ ...checked.values, updatedAt: new Date() }).where(eq(s.documents.id, id));
  await audit(actor.id, "document", id, "updated", { before: { category: doc.category, restricted: doc.restricted, expiresOn: doc.expiresOn }, after: { category: checked.values.category, restricted: checked.values.restricted, expiresOn: checked.values.expiresOn } });
  return { ok: true, message: "Documento atualizado." };
}

export async function deleteDocument(actor: Actor, id: string, reason: string): Promise<Result> {
  if (!can(actor.role, "document.manage") || !UUID.test(id)) return fail("Só o gestor e o dono excluem documentos.");
  if (reason.trim().length < 3) return fail("Informe o motivo da exclusão.");
  const db = await getDb();
  const [doc] = await db.select().from(s.documents).where(and(eq(s.documents.id, id), isNull(s.documents.deletedAt)));
  if (!doc) return fail("Documento não encontrado.");
  await db.update(s.documents).set({ deletedAt: new Date() }).where(eq(s.documents.id, id));
  await audit(actor.id, "document", id, "deleted", { reason: reason.trim(), before: { title: doc.restricted ? "(restrito)" : doc.title, category: doc.category } });
  return { ok: true, message: "Documento excluído." };
}

/** Documentos com validade em até 30 dias (para o painel; respeita a restrição). */
export async function documentsExpiring(actor: Actor, today: string = todayIso()) {
  const rows = await listDocuments(actor);
  return rows.filter(({ d }) => d.expiresOn && d.expiresOn <= addDays(today, 30)).map(({ d, clientName }) => ({ id: d.id, title: d.title, clientName, expiresOn: d.expiresOn!, expired: d.expiresOn! < today })).sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
}

/** Documento com validade próxima (30 dias) vira demanda para o gestor — uma vez por documento e data. */
export async function generateDocumentAlerts(today: string = todayIso()): Promise<{ created: number }> {
  const db = await getDb();
  const rows = await db.select().from(s.documents).where(and(isNull(s.documents.deletedAt), sql`${s.documents.expiresOn} is not null`, sql`${s.documents.expiresOn} <= ${addDays(today, 30)}`)).orderBy(asc(s.documents.expiresOn));
  if (!rows.length) return { created: 0 };
  const [internal] = await db.select({ id: s.clients.id }).from(s.clients).where(eq(s.clients.kind, "internal"));
  let created = 0;
  for (const d of rows) {
    const clientId = d.clientId ?? internal?.id;
    if (!clientId) continue;
    // Documento restrito: o título da demanda não revela o conteúdo (a demanda pode ser vista por mais gente).
    const name = d.restricted ? `${d.category} (restrito)` : d.title;
    const made = await openAlertDemand(db, "document_expiry", `${d.id}|${d.expiresOn}`, { clientId, title: `Documento vence em ${formatBr(d.expiresOn)}: ${name}`, description: "Renovar o documento ou enviar a nova versão em Documentos.", dueDate: d.expiresOn! < addDays(today, 3) ? today : addDays(today, 3) });
    if (made) created++;
  }
  return { created };
}
