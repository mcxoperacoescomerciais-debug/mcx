import { PageHeader } from "@/components/ui";
import { fmtUsd } from "@/lib/assistant";
import { requireCan } from "@/server/auth";
import { hasApiKey } from "@/server/anthropic";
import { getAssistantConfig, usageReport } from "@/server/assistant";
import { getDb, schema as s } from "@/server/db";
import { AssistantSettings } from "./settings";

export const metadata = { title: "Assistente: uso e ajustes" };

const STATE_LABEL = { ok: "Dentro do limite", warn: "Passou de 80% do limite", blocked: "Limite atingido: chat bloqueado" } as const;

export default async function AssistantConfigPage() {
  const user = await requireCan("assistant.manage");
  const db = await getDb();
  const [config, report, people] = await Promise.all([
    getAssistantConfig(),
    usageReport(user),
    db.select({ id: s.users.id, name: s.users.name, status: s.users.status }).from(s.users),
  ]);
  const r = report!;
  return (
    <>
      <PageHeader title="Assistente: uso e ajustes" subtitle="Custo real do piloto, quem pode usar e quanto pode gastar." />
      {!hasApiKey() && (
        <p role="alert" className="mb-4 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
          Falta a chave da API no servidor: crie em platform.claude.com › API Keys e coloque no Render (serviço mcx-operacoes › Environment) como <strong>ANTHROPIC_API_KEY</strong>. Sem ela o chat não responde.
        </p>
      )}
      <section className="card mb-4 p-4">
        <h2 className="font-semibold text-brand-900">Uso do mês</h2>
        <p className="mt-1 text-sm text-muted">{STATE_LABEL[r.global]} · limite global US$ {r.limitUsd}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Hoje" value={fmtUsd(r.today)} />
          <Stat label="No mês" value={fmtUsd(r.month)} />
          <Stat label="Projeção do mês" value={fmtUsd(r.projection)} />
          <Stat label="Média por mensagem" value={fmtUsd(r.avgPerMessage)} />
          <Stat label="Mensagens" value={String(r.messages)} />
          <Stat label="Conversas" value={String(r.conversations)} />
          <Stat label="Tokens do cache" value={r.cacheReadTokens.toLocaleString("pt-BR")} />
        </dl>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Breakdown title="Por pessoa" rows={r.byUser} />
          <Breakdown title="Por modelo" rows={r.byModel} />
        </div>
      </section>
      <AssistantSettings config={config} people={people.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.name }))} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-subtle px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; cost: number; messages: number }[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink-2">{title}</h3>
      {rows.length ? (
        <table className="mt-1 w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-line last:border-0">
                <td className="py-1.5">{row.label}</td>
                <td className="py-1.5 text-right tabular-nums text-muted">{row.messages} msg</td>
                <td className="py-1.5 text-right tabular-nums">{fmtUsd(row.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-1 text-sm text-muted">Sem uso neste mês.</p>
      )}
    </div>
  );
}
