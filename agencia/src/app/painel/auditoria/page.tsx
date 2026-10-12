import type { Metadata } from "next";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getScope, requireRole } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { PAGE_SIZE, parseFilters, withParams } from "@/lib/filters";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { Pagination, Table, Td, Th } from "../_components/widgets";

export const metadata: Metadata = { title: "Auditoria" };

const ENTITY_LABEL: Record<string, string> = {
  visit: "Visita",
  attendance: "Atendimento",
  rupture: "Ruptura",
  photo: "Foto",
  occurrence: "Ocorrência",
  issue: "Pendência",
  schedule: "Programação",
  route: "Roteiro",
  brand: "Marca",
  chain: "Rede",
  store: "Loja",
  product: "Produto",
  user: "Usuário",
  settings: "Configurações",
  agency: "Agência",
  report: "Relatório",
  export: "Exportação",
};

export default async function AuditPage({ searchParams }: PageProps<"/painel/auditoria">) {
  await requireRole(["admin"]);
  const scope = await getScope();
  const f = parseFilters(await searchParams, 7);
  const db = await getDb();
  const rows = await db
    .select({ log: s.auditLogs, userName: s.users.name, platform: s.users.platform, total: sql<number>`count(*) over()::int` })
    .from(s.auditLogs)
    .leftJoin(s.users, eq(s.users.id, s.auditLogs.userId))
    .where(
      and(
        eq(s.auditLogs.agencyId, scope.agencyId),
        gte(s.auditLogs.createdAt, new Date(`${f.from}T00:00:00-03:00`)),
        lte(s.auditLogs.createdAt, new Date(`${f.to}T23:59:59-03:00`)),
        f.kind ? eq(s.auditLogs.entity, f.kind) : undefined,
        f.q ? sql`(lower(${s.auditLogs.action}) like ${`%${f.q.toLowerCase()}%`} or lower(coalesce(${s.auditLogs.reason}, '')) like ${`%${f.q.toLowerCase()}%`} or ${s.auditLogs.entityId} like ${`%${f.q}%`})` : undefined,
      ),
    )
    .orderBy(desc(s.auditLogs.createdAt))
    .limit(PAGE_SIZE)
    .offset((f.page - 1) * PAGE_SIZE);
  const total = rows[0]?.total ?? 0;
  const show = (v: unknown) => (v ? JSON.stringify(v).slice(0, 220) : "");

  return (
    <>
      <PageHeader title="Auditoria" subtitle={`${total} registro(s) de ${fmtDate(f.from)} a ${fmtDate(f.to)} · quem fez o quê, quando e por quê`} />
      <FilterBar range={{ from: f.from, to: f.to }} fields={["period", "kind", "q"]} options={{ kinds: Object.entries(ENTITY_LABEL).map(([id, name]) => ({ id, name })) }} kindLabel="Todas as entidades" qPlaceholder="Ação, motivo ou id" />
      <div className="bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden">
        <Table>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Quem</Th>
              <Th>Entidade</Th>
              <Th>Ação</Th>
              <Th>Motivo</Th>
              <Th>Alteração</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ log, userName, platform }) => (
              <tr key={log.id} className="align-top">
                <Td className="whitespace-nowrap tnum">{fmtDateTime(log.createdAt)}</Td>
                <Td>{userName ? (platform ? `${userName} (MCX)` : userName) : "Sistema"}</Td>
                <Td>
                  {ENTITY_LABEL[log.entity] ?? log.entity}
                  <span className="block text-[11px] text-muted font-mono">{log.entityId.slice(0, 18)}</span>
                </Td>
                <Td className="font-medium">{log.action}</Td>
                <Td className="text-ink-2 max-w-[220px]">{log.reason ?? ""}</Td>
                <Td className="text-[11.5px] font-mono text-muted max-w-[360px] break-all">
                  {log.before ? <span className="block">antes: {show(log.before)}</span> : null}
                  {log.after ? <span className="block">depois: {show(log.after)}</span> : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={f.page} total={total} pageSize={PAGE_SIZE} hrefFor={(p) => withParams({ from: f.from, to: f.to, kind: f.kind, q: f.q || null }, { page: p })} />
      </div>
    </>
  );
}
