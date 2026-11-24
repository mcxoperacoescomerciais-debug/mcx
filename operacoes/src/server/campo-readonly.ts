/**
 * Leitura do MCX Campo para o Assistente — SOMENTE LEITURA.
 *
 * - Conexão própria em CAMPO_READONLY_DATABASE_URL, com o papel "mcx_leitura"
 *   criado no banco do Campo (docs/CAMPO_LEITURA.sql): só tem SELECT nas
 *   colunas listadas lá (nada de senha, telefone, custo ou foto).
 * - Além do papel, toda consulta roda numa transação READ ONLY com limite de
 *   tempo: mesmo que alguém troque a URL por um usuário com escrita, este
 *   código não consegue gravar.
 * - Só consultas fixas, com parâmetros: o modelo escolhe o filtro, nunca o SQL.
 * - Nenhuma linha daqui é copiada para o banco do Operações.
 */
import "server-only";
import postgres from "postgres";

type GlobalWithCampo = typeof globalThis & { __campoRo?: postgres.Sql };
const g = globalThis as GlobalWithCampo;

export const campoConfigured = () => /^postgres(ql)?:\/\//.test(process.env.CAMPO_READONLY_DATABASE_URL ?? "");

function client(): postgres.Sql {
  const url = process.env.CAMPO_READONLY_DATABASE_URL ?? "";
  if (!campoConfigured()) throw new Error("Leitura do Campo não configurada.");
  if (url === process.env.DATABASE_URL) throw new Error("CAMPO_READONLY_DATABASE_URL não pode ser o banco do Operações.");
  g.__campoRo ??= postgres(url, { prepare: false, max: 2, idle_timeout: 30, connect_timeout: 10 });
  return g.__campoRo;
}

/** Roda consultas numa transação READ ONLY, com 8 s no máximo. */
async function readOnly<T>(fn: (sql: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return client().begin("read only", async (sql) => {
    await sql`set local statement_timeout = 8000`;
    return fn(sql);
  }) as Promise<T>;
}

const SP = "America/Sao_Paulo";

export interface CampoFilters {
  from: string;
  to: string;
  agency?: string | null;
  brand?: string | null;
  limit?: number;
}

const like = (v: string | null | undefined) => (v && v.trim() ? `%${v.trim()}%` : null);
const lim = (n: number | undefined, max = 50) => Math.min(Math.max(Number.isInteger(n) ? n! : 20, 1), max);

/** Números do período por agência (só agências clientes, não a da plataforma). */
export async function campoSummary(f: CampoFilters) {
  const ag = like(f.agency);
  return readOnly(async (sql) => {
    const agencies = await sql<{ id: string; name: string }[]>`
      select id, name from agencies
      where status = 'active' and kind = 'client' and (${ag}::text is null or name ilike ${ag})
      order by name`;
    const ids = agencies.map((a) => a.id);
    if (!ids.length) return { agencies: [], note: "Nenhuma agência encontrada com esse nome." };
    const [scheduled, visits, missed, ruptures, damages, validities, occurrences, quiet] = await Promise.all([
      sql`select agency_id, count(*)::int n from schedules where agency_id = any(${ids}::uuid[]) and status = 'active' and date between ${f.from} and ${f.to} group by agency_id`,
      sql`select agency_id, status, count(*)::int n from visits where agency_id = any(${ids}::uuid[]) and visit_date between ${f.from} and ${f.to} group by agency_id, status`,
      sql`select s.agency_id, count(*)::int n from schedules s
          where s.agency_id = any(${ids}::uuid[]) and s.status = 'active' and s.date between ${f.from} and ${f.to}
            and not exists (select 1 from visits v where v.status <> 'cancelled' and (v.schedule_id = s.id or (v.promoter_id = s.promoter_id and v.store_id = s.store_id and v.visit_date = s.date)))
          group by s.agency_id`,
      sql`select agency_id, count(*)::int n from ruptures where agency_id = any(${ids}::uuid[]) and deleted_at is null and (recorded_at at time zone ${SP})::date between ${f.from} and ${f.to} group by agency_id`,
      sql`select agency_id, count(*)::int n from damages where agency_id = any(${ids}::uuid[]) and deleted_at is null and (recorded_at at time zone ${SP})::date between ${f.from} and ${f.to} group by agency_id`,
      sql`select agency_id, count(*) filter (where days_to_expiry < 0)::int vencidos, count(*) filter (where days_to_expiry between 0 and 7)::int ate_7_dias from validities where agency_id = any(${ids}::uuid[]) and deleted_at is null and (recorded_at at time zone ${SP})::date between ${f.from} and ${f.to} group by agency_id`,
      sql`select agency_id, count(*) filter (where status = 'open')::int abertas, count(*)::int total from occurrences where agency_id = any(${ids}::uuid[]) and deleted_at is null and (recorded_at at time zone ${SP})::date between ${f.from} and ${f.to} group by agency_id`,
      sql`select agency_id, count(*)::int n from users where agency_id = any(${ids}::uuid[]) and role = 'promoter' and status = 'active' and (last_seen_at is null or (last_seen_at at time zone ${SP})::date < ${f.to}) group by agency_id`,
    ]);
    const pick = (rows: postgres.RowList<postgres.Row[]>, id: string, key = "n") => Number(rows.find((r) => r.agency_id === id)?.[key] ?? 0);
    return {
      agencies: agencies.map((a) => {
        const v = visits.filter((r) => r.agency_id === a.id);
        const byStatus = (st: string) => Number(v.find((r) => r.status === st)?.n ?? 0);
        return {
          agencia: a.name,
          lojas_programadas: pick(scheduled, a.id),
          visitas_concluidas: byStatus("completed"),
          visitas_encerradas_incompletas: byStatus("closed_incomplete"),
          visitas_em_andamento: byStatus("in_progress"),
          programadas_sem_visita: pick(missed, a.id),
          rupturas: pick(ruptures, a.id),
          avarias: pick(damages, a.id),
          validades_vencidas: pick(validities, a.id, "vencidos"),
          validades_ate_7_dias: pick(validities, a.id, "ate_7_dias"),
          ocorrencias_abertas: pick(occurrences, a.id, "abertas"),
          promotores_sem_abrir_o_app_no_ultimo_dia: pick(quiet, a.id),
        };
      }),
    };
  });
}

export type CampoDetail = "lojas_sem_visita" | "visitas" | "rupturas" | "avarias" | "validades" | "ocorrencias" | "promotores_sem_sinal";
export const CAMPO_DETAILS: CampoDetail[] = ["lojas_sem_visita", "visitas", "rupturas", "avarias", "validades", "ocorrencias", "promotores_sem_sinal"];

/** Os mesmos nomes que aparecem no Campo, em vez dos códigos gravados no banco. */
const LABELS: Record<string, Record<string, string>> = {
  ocorrencia: { total: "Ruptura total", shelf_empty: "Sem estoque na área de venda", backroom_empty: "Sem estoque no depósito (verificado)", missing_display: "Ausente da exposição", registered_not_found: "Cadastrado, mas não localizado", unavailable_other: "Indisponível por outro motivo", unconfirmed: "Ainda não confirmada" },
  tipo: { damaged_package: "Embalagem danificada", violated: "Embalagem violada", no_vacuum: "Sem vácuo", strange_color: "Coloração estranha", liquid: "Líquido", unfit: "Produto impróprio", other: "Outro" },
  categoria: { no_space: "Produto sem espaço adequado", incomplete_display: "Exposição incompleta", missing_material: "Material de merchandising ausente", cannot_execute: "Impossibilidade de executar", store_closed: "Loja fechada ou setor inacessível", route_divergence: "Divergência no roteiro", display_problem: "Problema com a exposição", other: "Outra ocorrência" },
  situacao: { in_progress: "Em andamento", completed: "Concluída", closed_incomplete: "Encerrada incompleta", cancelled: "Cancelada", open: "Aberta" },
};
const ATTENDANCE_LABEL: Record<string, string> = { in_progress: "em andamento", completed: "concluído", correction_requested: "pendente de correção", cancelled: "não atendida" };

export function labelRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "string" && LABELS[k]?.[v]) out[k] = LABELS[k][v];
    else if (k === "marcas" && typeof v === "string") out[k] = v.replace(/\(([a-z_]+)\)/g, (m, code: string) => `(${ATTENDANCE_LABEL[code] ?? code})`);
    else if (v instanceof Date) out[k] = v.toISOString().slice(0, 10);
    else out[k] = v;
  }
  return out;
}

/** Lista detalhada de um tipo de dado do Campo (no máximo 50 linhas). */
export async function campoDetail(kind: CampoDetail, f: CampoFilters): Promise<Record<string, unknown>[]> {
  const rows = (await campoDetailRaw(kind, f)) as unknown as Record<string, unknown>[];
  return rows.map(labelRow);
}

async function campoDetailRaw(kind: CampoDetail, f: CampoFilters) {
  const ag = like(f.agency);
  const br = like(f.brand);
  const n = lim(f.limit);
  return readOnly(async (sql) => {
    const agencyOk = sql`a.status = 'active' and a.kind = 'client' and (${ag}::text is null or a.name ilike ${ag})`;
    switch (kind) {
      case "lojas_sem_visita":
        return sql`
          select s.date as data, a.name as agencia, u.name as promotor, st.name as loja, st.city as cidade,
                 (select string_agg(b.name, ', ' order by b.name) from schedule_brands sb join brands b on b.id = sb.brand_id where sb.schedule_id = s.id) as marcas
          from schedules s join agencies a on a.id = s.agency_id join users u on u.id = s.promoter_id join stores st on st.id = s.store_id
          where ${agencyOk} and s.status = 'active' and s.date between ${f.from} and ${f.to}
            and not exists (select 1 from visits v where v.status <> 'cancelled' and (v.schedule_id = s.id or (v.promoter_id = s.promoter_id and v.store_id = s.store_id and v.visit_date = s.date)))
            and (${br}::text is null or exists (select 1 from schedule_brands sb join brands b on b.id = sb.brand_id where sb.schedule_id = s.id and b.name ilike ${br}))
          order by s.date, a.name, u.name limit ${n}`;
      case "visitas":
        return sql`
          select v.visit_date as data, a.name as agencia, u.name as promotor, st.name as loja, v.status as situacao,
                 to_char(v.started_at at time zone ${SP}, 'HH24:MI') as inicio, to_char(v.finished_at at time zone ${SP}, 'HH24:MI') as fim,
                 (select string_agg(b.name || ' (' || at.status || ')', ', ') from attendances at join brands b on b.id = at.brand_id where at.visit_id = v.id) as marcas
          from visits v join agencies a on a.id = v.agency_id join users u on u.id = v.promoter_id join stores st on st.id = v.store_id
          where ${agencyOk} and v.visit_date between ${f.from} and ${f.to} and v.status <> 'cancelled'
            and (${br}::text is null or exists (select 1 from attendances at join brands b on b.id = at.brand_id where at.visit_id = v.id and b.name ilike ${br}))
          order by v.visit_date desc, v.started_at desc limit ${n}`;
      case "rupturas":
        return sql`
          select (r.recorded_at at time zone ${SP})::date as data, a.name as agencia, ch.name as rede, st.name as pdv, p.name as produto, b.name as marca, r.situation as ocorrencia, u.name as promotor
          from ruptures r join attendances at on at.id = r.attendance_id join visits v on v.id = at.visit_id join agencies a on a.id = r.agency_id
          join stores st on st.id = v.store_id left join chains ch on ch.id = st.chain_id join products p on p.id = r.product_id join brands b on b.id = at.brand_id join users u on u.id = v.promoter_id
          where ${agencyOk} and r.deleted_at is null and (r.recorded_at at time zone ${SP})::date between ${f.from} and ${f.to} and (${br}::text is null or b.name ilike ${br})
          order by r.recorded_at desc limit ${n}`;
      case "avarias":
        return sql`
          select (d.recorded_at at time zone ${SP})::date as data, a.name as agencia, st.name as pdv, p.name as produto, b.name as marca, d.kind as tipo, d.quantity as quantidade, d.unit as unidade, u.name as promotor
          from damages d join attendances at on at.id = d.attendance_id join visits v on v.id = at.visit_id join agencies a on a.id = d.agency_id
          join stores st on st.id = v.store_id join products p on p.id = d.product_id join brands b on b.id = at.brand_id join users u on u.id = v.promoter_id
          where ${agencyOk} and d.deleted_at is null and (d.recorded_at at time zone ${SP})::date between ${f.from} and ${f.to} and (${br}::text is null or b.name ilike ${br})
          order by d.recorded_at desc limit ${n}`;
      case "validades":
        return sql`
          select (x.recorded_at at time zone ${SP})::date as registrado, a.name as agencia, st.name as pdv, p.name as produto, b.name as marca, x.expiry_date as vence_em, x.days_to_expiry as dias_para_vencer, x.quantity as quantidade, x.unit as unidade
          from validities x join attendances at on at.id = x.attendance_id join visits v on v.id = at.visit_id join agencies a on a.id = x.agency_id
          join stores st on st.id = v.store_id join products p on p.id = x.product_id join brands b on b.id = at.brand_id
          where ${agencyOk} and x.deleted_at is null and x.days_to_expiry <= 30 and (x.recorded_at at time zone ${SP})::date between ${f.from} and ${f.to} and (${br}::text is null or b.name ilike ${br})
          order by x.days_to_expiry asc, x.recorded_at desc limit ${n}`;
      case "ocorrencias":
        return sql`
          select (o.recorded_at at time zone ${SP})::date as data, a.name as agencia, st.name as pdv, b.name as marca, o.category as categoria, o.status as situacao, left(o.note, 200) as observacao
          from occurrences o join attendances at on at.id = o.attendance_id join visits v on v.id = at.visit_id join agencies a on a.id = o.agency_id
          join stores st on st.id = v.store_id join brands b on b.id = at.brand_id
          where ${agencyOk} and o.deleted_at is null and (o.recorded_at at time zone ${SP})::date between ${f.from} and ${f.to} and (${br}::text is null or b.name ilike ${br})
          order by (o.status = 'open') desc, o.recorded_at desc limit ${n}`;
      case "promotores_sem_sinal":
        return sql`
          select a.name as agencia, u.name as promotor, to_char(u.last_seen_at at time zone ${SP}, 'DD/MM/YYYY HH24:MI') as ultimo_sinal,
                 (select count(*)::int from schedules s where s.promoter_id = u.id and s.status = 'active' and s.date = ${f.to}) as lojas_programadas_no_dia
          from users u join agencies a on a.id = u.agency_id
          where ${agencyOk} and u.role = 'promoter' and u.status = 'active' and (u.last_seen_at is null or (u.last_seen_at at time zone ${SP})::date < ${f.to})
          order by lojas_programadas_no_dia desc, u.last_seen_at asc nulls first limit ${n}`;
    }
  });
}
