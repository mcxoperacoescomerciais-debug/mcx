/**
 * Importação do Notion com pré-visualização. Regras (seção 4.7):
 * - só entram tarefas NÃO concluídas; status 1:1; "Data de Término" vira prazo;
 * - cliente pelo de-para aprovado; o que não for reconhecido NÃO entra até a
 *   pessoa dizer para qual contratante vai;
 * - sem responsável reconhecido entra como "A distribuir";
 * - nunca inventa responsável nem prazo; repetir o mesmo arquivo não duplica.
 */
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { todayIso } from "@/lib/dates";
import { INTERNAL_CLIENT_NAME, STATUS_LABEL, type Priority, type Status } from "@/lib/domain";
import { norm, NOTION_CLIENT_MAP, readNotionCsv, relationNames } from "@/lib/notion-import";
import { can } from "@/lib/permissions";
import { looksDuplicate } from "@/lib/similarity";
import { audit } from "./audit";
import { getDb, schema as s } from "./db";
import type { Actor, Result } from "./demands";

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const UUID = /^[0-9a-f-]{36}$/i;

export interface NotionPreviewRow {
  line: number;
  title: string;
  action: "import" | "skip";
  /** Por que não entra (quando action = skip). */
  reason: string | null;
  warnings: string[];
  clientName: string | null;
  brand: string | null;
  assigneeName: string | null;
  statusLabel: string | null;
  dueDate: string | null;
}

export interface NotionImportOptions {
  dryRun: boolean;
  /** Categoria das demandas importadas (obrigatória para importar de verdade). */
  categoryId?: string | null;
  /** Nome do cliente no Notion → id do contratante, para os nomes não reconhecidos. */
  clientMap?: Record<string, string>;
  /** Tarefas sem cliente no Notion: "internal" manda para Interno MCX; "skip" não importa. */
  noClient?: "internal" | "skip";
}

export interface NotionImportResult {
  rows: NotionPreviewRow[];
  toImport: number;
  skipped: number;
  created: number;
  unassigned: number;
  /** Clientes do Notion que o sistema não reconheceu (para a pessoa mapear). */
  unmatchedClients: string[];
  unknownColumns: string[];
}

export async function importNotion(actor: Actor, csv: string, opts: NotionImportOptions): Promise<Result<NotionImportResult>> {
  if (!can(actor.role, "import.run")) return fail("Só o gestor e o dono importam do Notion.");
  if (csv.length > 2_000_000) return fail("Arquivo muito grande (máximo de 2 MB).");
  const parsed = readNotionCsv(csv);
  if (parsed.error) return fail(parsed.error);
  if (parsed.rows.length > 3000) return fail("Máximo de 3.000 linhas por importação.");
  const db = await getDb();
  const [clients, brands, users, existing, categories] = await Promise.all([
    db.select().from(s.clients).where(isNull(s.clients.deletedAt)),
    db.select().from(s.clientBrands),
    db.select().from(s.users).where(eq(s.users.status, "active")),
    db.select({ id: s.demands.id, number: s.demands.number, title: s.demands.title, clientId: s.demands.clientId, status: s.demands.status }).from(s.demands).where(isNull(s.demands.deletedAt)),
    db.select().from(s.categories),
  ]);
  const category = opts.categoryId && UUID.test(opts.categoryId) ? categories.find((c) => c.id === opts.categoryId) : undefined;
  if (!opts.dryRun && !category) return fail("Escolha a categoria das demandas importadas.");
  const internal = clients.find((c) => c.kind === "internal" || c.name === INTERNAL_CLIENT_NAME);
  const byName = (name: string) => clients.find((c) => norm(c.name) === norm(name));
  const extra = new Map(Object.entries(opts.clientMap ?? {}).map(([k, v]) => [norm(k), v]));

  function resolveClient(raw: string): { id: string; name: string; brand: string | null } | null {
    const key = norm(raw);
    const mapped = extra.get(key);
    if (mapped) {
      const c = clients.find((x) => x.id === mapped);
      if (c) return { id: c.id, name: c.name, brand: null };
    }
    const fixed = NOTION_CLIENT_MAP[key];
    if (fixed) {
      const c = fixed.internal ? internal : byName(fixed.client!);
      return c ? { id: c.id, name: c.name, brand: fixed.brand ?? null } : null;
    }
    const exact = byName(raw);
    if (exact) return { id: exact.id, name: exact.name, brand: null };
    // "Etros" → "Etros Promocional"; "AF" → "AF Merchandising": a palavra precisa bater inteira e apontar para um só.
    const partial = clients.filter((c) => c.kind !== "internal" && norm(c.name).split(" ").includes(key));
    if (partial.length === 1) return { id: partial[0].id, name: partial[0].name, brand: null };
    const brand = brands.filter((b) => norm(b.name) === key);
    if (brand.length === 1) {
      const c = clients.find((x) => x.id === brand[0].clientId);
      if (c) return { id: c.id, name: c.name, brand: brand[0].name };
    }
    return null;
  }

  const rows: NotionPreviewRow[] = [];
  const inserts: { row: NotionPreviewRow; clientId: string; assigneeId: string | null; status: Status; priority: Priority; description: string | null; waiting: boolean }[] = [];
  const unmatched = new Set<string>();
  const seen = new Set<string>();
  const today = todayIso();

  for (const r of parsed.rows) {
    const out: NotionPreviewRow = { line: r.line, title: r.title, action: "import", reason: null, warnings: [], clientName: null, brand: null, assigneeName: null, statusLabel: null, dueDate: r.dueDate ?? null };
    rows.push(out);
    const skip = (reason: string) => {
      out.action = "skip";
      out.reason = reason;
    };
    if (r.title.length < 3) {
      skip("Título muito curto.");
      continue;
    }
    if (r.status === "skip") {
      skip(`Concluída ou cancelada no Notion (“${r.statusRaw}”): fica só lá.`);
      continue;
    }
    let status: Status = "todo";
    if (r.status === null) out.warnings.push(`Status “${r.statusRaw}” não reconhecido: entra como “A fazer”.`);
    else status = r.status;
    out.statusLabel = STATUS_LABEL[status];

    const clientNames = relationNames(r.clientRaw);
    let client: { id: string; name: string; brand: string | null } | null = null;
    if (!clientNames.length) {
      if (opts.noClient === "internal" && internal) client = { id: internal.id, name: internal.name, brand: null };
      else {
        skip("Sem cliente no Notion. Marque “tarefas sem cliente vão para Interno MCX” ou preencha no Notion.");
        continue;
      }
    } else {
      client = resolveClient(clientNames[0]);
      if (!client) {
        unmatched.add(clientNames[0]);
        skip(`Cliente “${clientNames[0]}” não reconhecido: escolha o contratante correspondente acima.`);
        continue;
      }
      if (clientNames.length > 1) out.warnings.push(`Tinha ${clientNames.length} clientes; ficou no primeiro (${clientNames[0]}).`);
    }
    out.clientName = client.name;
    out.brand = client.brand;

    const people = relationNames(r.assigneeRaw);
    const person = people.map((p) => users.find((u) => norm(u.name) === norm(p) || norm(u.name) === norm(p).split(" ")[0] || norm(u.username) === norm(p))).find(Boolean) ?? null;
    if (person) {
      out.assigneeName = person.name;
      if (people.length > 1) out.warnings.push(`Tinha ${people.length} responsáveis; ficou com ${person.name}.`);
    } else out.warnings.push(people.length ? `Responsável “${people.join(", ")}” não é usuário do sistema: entra como “A distribuir”.` : "Sem responsável: entra como “A distribuir”.");

    if (r.dueDate === undefined) out.warnings.push(`Data “${r.dueRaw}” não reconhecida: entra sem prazo.`);
    else if (r.dueDate === null) out.warnings.push("Sem prazo no Notion: entra sem prazo.");
    if (status === "waiting") out.warnings.push("Aguardando retorno: de quem e a data de cobrança ficam “a confirmar” (cobrança marcada para hoje).");

    const key = `${client.id}|${norm(r.title)}`;
    const same = existing.find((d) => d.clientId === client.id && norm(d.title) === norm(r.title));
    if (same) {
      skip(`Já existe no sistema: #${same.number}.`);
      continue;
    }
    if (seen.has(key)) {
      skip("Linha repetida no arquivo.");
      continue;
    }
    seen.add(key);
    const similar = existing.find((d) => d.clientId === client.id && d.status !== "done" && d.status !== "cancelled" && looksDuplicate(d.title, r.title));
    if (similar) out.warnings.push(`Parecida com a demanda #${similar.number} (“${similar.title}”). Confira para não duplicar.`);

    inserts.push({ row: out, clientId: client.id, assigneeId: person?.id ?? null, status, priority: r.priority ?? "medium", description: r.description || null, waiting: status === "waiting" });
  }

  let created = 0;
  if (!opts.dryRun && category) {
    await db.transaction(async (tx) => {
      for (const i of inserts) {
        const [demand] = await tx
          .insert(s.demands)
          .values({ title: i.row.title, clientId: i.clientId, categoryId: category.id, assigneeId: i.assigneeId, status: i.status, priority: i.priority, dueDate: i.row.dueDate, description: i.description, brand: i.row.brand, origin: "system", waitingFor: i.waiting ? "A confirmar (importado do Notion)" : null, followUpDate: i.waiting ? today : null, createdBy: actor.id })
          .returning({ id: s.demands.id });
        await tx.insert(s.demandHistory).values({ demandId: demand.id, userId: actor.id, field: "created", toValue: "Importada do Notion" });
        created++;
      }
      await audit(actor.id, "demand", "import-notion", "imported", { after: { created, skipped: rows.length - inserts.length }, source: "notion" }, tx);
    });
  }
  return { ok: true, rows, toImport: inserts.length, skipped: rows.length - inserts.length, created, unassigned: inserts.filter((i) => !i.assigneeId).length, unmatchedClients: [...unmatched].sort(), unknownColumns: parsed.unknownColumns, message: opts.dryRun ? undefined : `${created} ${created === 1 ? "demanda importada" : "demandas importadas"}.` };
}

/** Demandas sem responsável ("A distribuir"), para o aviso ao gestor. */
export async function unassignedCount(): Promise<number> {
  const db = await getDb();
  const rows = await db.select({ id: s.demands.id }).from(s.demands).where(and(isNull(s.demands.deletedAt), isNull(s.demands.assigneeId)));
  return rows.length;
}
