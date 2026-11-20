import Link from "next/link";
import { ContractForm } from "@/components/docs/forms";
import { PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/crm";
import { addDays, formatBr, todayIso } from "@/lib/dates";
import { CONTRACT_STATUS_LABEL } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { requireCan } from "@/server/auth";
import { listContracts } from "@/server/contracts";
import { formOptions } from "@/server/demands";

export const metadata = { title: "Contratos" };

export default async function ContractsPage() {
  const user = await requireCan("contract.view");
  const [rows, options] = await Promise.all([listContracts(user), formOptions()]);
  const today = todayIso();
  const soon = addDays(today, 30);
  const active = rows.filter(({ c }) => c.status === "active");
  const total = active.reduce((sum, { c }) => sum + c.monthlyValueCents, 0);
  return (
    <>
      <PageHeader title="Contratos" subtitle={`${active.length} ${active.length === 1 ? "vigente" : "vigentes"} · ${formatMoney(total)} por mês`} />
      <div className="mb-6 space-y-2">
        {rows.length === 0 && <p className="card px-4 py-6 text-center text-sm text-muted">Nenhum contrato cadastrado. Cadastre os contratos atuais abaixo.</p>}
        {rows.map(({ c, clientName }) => {
          const ending = c.status === "active" && !!c.endDate && c.endDate <= soon;
          return (
            <Link key={c.id} href={`/contratos/${c.id}`} className={`card block px-4 py-3 hover:border-brand-500 ${ending ? "border-l-4 border-l-warn" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <p className="font-semibold text-ink">{clientName}</p>
                <p className="text-sm font-bold text-brand-900">{formatMoney(c.monthlyValueCents)}/mês</p>
              </div>
              <p className="mt-0.5 text-sm text-ink-2">{c.services}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span className={c.status === "active" ? "rounded-full bg-ok-bg px-2 py-0.5 font-semibold text-ok" : c.status === "draft" ? "rounded-full bg-warn-bg px-2 py-0.5 font-semibold text-warn" : "rounded-full bg-subtle px-2 py-0.5 font-semibold text-muted"}>{CONTRACT_STATUS_LABEL[c.status]}</span>
                {c.startDate && <span>de {formatBr(c.startDate)} a {formatBr(c.endDate)}</span>}
                {c.autoRenew && <span>· renovação automática</span>}
                {ending && <span className="font-semibold text-warn">· {c.endDate! < today ? "vigência vencida" : "termina em até 30 dias"}</span>}
              </p>
            </Link>
          );
        })}
      </div>
      {can(user.role, "contract.manage") && (
        <section className="card p-4" aria-labelledby="ct-new">
          <h2 id="ct-new" className="mb-3 text-sm font-bold text-ink-2">Novo contrato</h2>
          <ContractForm clients={options.clients.filter((c) => c.kind !== "internal").map((c) => ({ id: c.id, name: c.name }))} />
        </section>
      )}
    </>
  );
}
