import type { Metadata } from "next";
import { ListSearch } from "@/app/painel/_components/list-search";
import { desc, eq } from "drizzle-orm";
import { getScope, requireRole } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Auditoria" };

const ENTITY_LABEL: Record<string, string> = {
  occurrence: "Ocorrência",
  visit: "Visita",
  user: "Usuário",
  store: "Loja",
  product: "Produto",
  network: "Rede",
  settings: "Configurações",
  mix: "Mix",
};
const ACTION_LABEL: Record<string, string> = {
  create: "criou",
  update: "alterou",
  "update+password": "alterou (com senha)",
  delete: "excluiu",
  status: "mudou status",
  finish: "finalizou",
  login: "entrou",
  password_change: "trocou a senha",
  import: "importou",
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default async function AuditPage() {
  await requireRole(["admin"]);
  const scope = await getScope();
  const db = await getDb();
  const rows = await db
    .select({ log: s.auditLogs, userName: s.users.name })
    .from(s.auditLogs)
    .leftJoin(s.users, eq(s.users.id, s.auditLogs.userId))
    .where(eq(s.auditLogs.tenantId, scope.tenantId))
    .orderBy(desc(s.auditLogs.createdAt))
    .limit(300);

  return (
    <>
      <PageHeader title="Auditoria" subtitle="Últimas 300 alterações. Alterações de quantidade, validade e status ficam registradas com o valor anterior e o novo." />
      <Card className="overflow-hidden">
        <ListSearch placeholder="Pesquisar usuário, item ou alteração..." />
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line bg-navy-50/50">
              <th className="font-semibold px-5 py-2.5">Quando</th>
              <th className="font-semibold px-3 py-2.5">Quem</th>
              <th className="font-semibold px-3 py-2.5">O quê</th>
              <th className="font-semibold px-5 py-2.5">Mudanças</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ log, userName }) => {
              const before = (log.before ?? {}) as Record<string, unknown>;
              const after = (log.after ?? {}) as Record<string, unknown>;
              const keys = log.action === "create" ? [] : Object.keys(after).slice(0, 6);
              return (
                <tr key={log.id} className="border-b border-line last:border-0 align-top">
                  <td className="px-5 py-2.5 whitespace-nowrap tnum text-[12.5px]">{log.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" })}</td>
                  <td className="px-3 py-2.5">{userName ?? "Sistema"}</td>
                  <td className="px-3 py-2.5">
                    {ACTION_LABEL[log.action] ?? log.action} <Badge>{ENTITY_LABEL[log.entity] ?? log.entity}</Badge>
                    <div className="text-[11px] text-muted font-mono">{log.entityId.slice(0, 8)}</div>
                  </td>
                  <td className="px-5 py-2.5 text-[12.5px]">
                    {keys.length ? (
                      <ul className="space-y-0.5">
                        {keys.map((k) => (
                          <li key={k}>
                            <span className="text-muted">{k}:</span> <s className="text-[#B42318]">{formatValue(before[k])}</s> → <b>{formatValue(after[k])}</b>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
