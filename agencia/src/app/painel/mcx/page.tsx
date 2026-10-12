import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Building, CheckCircle2, PackageX, ShieldAlert, Store, Users } from "lucide-react";
import { requirePlatform } from "@/server/auth";
import { macroOverview } from "@/server/platform";
import { fmtAgo, fmtLongDate, todayIso } from "@/lib/dates";
import { pct } from "@/lib/rules";
import { Badge, EmptyState, LinkButton, PageHeader, Progress, buttonClass, inputClass } from "@/components/ui";
import { KpiCard, SectionCard, Table, Td, Th } from "../_components/widgets";
import { enterAgencyAction } from "./actions";

export const metadata: Metadata = { title: "Visão MCX" };

export default async function McxOverviewPage({ searchParams }: PageProps<"/painel/mcx">) {
  const user = await requirePlatform();
  const sp = await searchParams;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayIso();
  const rows = await macroOverview(user, date);
  const active = rows.filter((r) => r.agency.status === "active");
  const sum = (fn: (r: (typeof rows)[number]) => number) => active.reduce((n, r) => n + fn(r), 0);
  const t = {
    storesScheduled: sum((r) => r.kpis.storesScheduled),
    storesCompleted: sum((r) => r.kpis.storesCompleted),
    pendingOrLate: sum((r) => r.kpis.storesPendingOrLate),
    late: sum((r) => r.kpis.storesLate + r.kpis.storesMissed),
    inProgress: sum((r) => r.kpis.visitsInProgress),
    promotersScheduled: sum((r) => r.kpis.promotersScheduled),
    promotersActive: sum((r) => r.kpis.promotersActive),
    issues: sum((r) => r.openIssues),
    ruptures: sum((r) => r.openRuptures),
  };

  return (
    <>
      <PageHeader
        eyebrow="MCX · todas as agências"
        title="Visão geral"
        subtitle={<span className="first-letter:uppercase inline-block">{fmtLongDate(date)} · soma das agências ativas; cada agência continua vendo só os próprios dados</span>}
        actions={
          <form className="flex items-center gap-2">
            <input type="date" name="date" defaultValue={date} className={inputClass + " !w-auto"} aria-label="Data" />
            <button className={buttonClass("secondary")}>Ver dia</button>
          </form>
        }
      />

      {!rows.length ? (
        <EmptyState icon={<Building className="size-8" />} title="Nenhuma agência cadastrada">
          <LinkButton href="/painel/mcx/agencias" className="mt-3">Cadastrar agência</LinkButton>
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <KpiCard label="Agências ativas" value={active.length} sub={`${rows.length - active.length} suspensa(s)`} href="/painel/mcx/agencias" icon={<Building className="size-4" />} />
            <KpiCard label="Lojas programadas" value={t.storesScheduled} sub={`${t.inProgress} visita(s) em andamento`} icon={<Store className="size-4" />} />
            <KpiCard label="Lojas concluídas" value={t.storesCompleted} tone="success" sub={`${pct(t.storesCompleted, t.storesScheduled) ?? "—"}% do programado`} icon={<CheckCircle2 className="size-4" />} />
            <KpiCard label="Pendentes ou atrasadas" value={t.pendingOrLate} tone={t.late ? "danger" : "neutral"} sub={`${t.late} atrasada(s) ou não realizada(s)`} icon={<AlertTriangle className="size-4" />} />
            <KpiCard label="Pendências abertas" value={t.issues} tone={t.issues ? "warning" : "success"} sub="Na data selecionada" icon={<ShieldAlert className="size-4" />} />
            <KpiCard label="Rupturas no dia" value={t.ruptures} tone={t.ruptures ? "danger" : "neutral"} sub="Marcadas pelos promotores" icon={<PackageX className="size-4" />} />
          </div>

          <SectionCard title="Por agência" subtitle="Entre no painel de uma agência para ver e tratar os detalhes dela." className="mt-5" bodyClass="pb-1">
            <Table>
              <thead>
                <tr>
                  <Th>Agência</Th>
                  <Th align="right">Promotores</Th>
                  <Th align="right">Lojas</Th>
                  <Th>Concluídas</Th>
                  <Th align="right">Em andamento</Th>
                  <Th align="right">Atrasadas</Th>
                  <Th align="right">Pendências</Th>
                  <Th align="right">Rupturas</Th>
                  <Th>Último registro</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ agency, kpis: k, openIssues, openRuptures, lastSyncAt }) => (
                  <tr key={agency.id} className={agency.status === "suspended" ? "opacity-60" : ""}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        {agency.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={agency.logoUrl} alt="" className="size-8 rounded-full object-cover bg-white ring-1 ring-line" />
                        ) : (
                          <span className="size-8 rounded-full bg-brand-800 text-white grid place-items-center font-bold text-[13px]">{agency.name.slice(0, 1)}</span>
                        )}
                        <div className="leading-tight">
                          <Link href={`/painel/mcx/agencias/${agency.id}`} className="font-semibold hover:underline">{agency.name}</Link>
                          {agency.status === "suspended" ? <Badge tone="danger" className="ml-2">Suspensa</Badge> : null}
                        </div>
                      </div>
                    </Td>
                    <Td align="right">{k.promotersActive}/{k.promotersScheduled}</Td>
                    <Td align="right">{k.storesScheduled}</Td>
                    <Td>
                      <div className="flex items-center gap-2 min-w-[140px]">
                        <Progress value={k.storesCompleted} total={k.storesScheduled} className="flex-1" />
                        <span className="tnum text-[12.5px] w-16 text-right">{k.storesCompleted} · {pct(k.storesCompleted, k.storesScheduled) ?? "—"}%</span>
                      </div>
                    </Td>
                    <Td align="right">{k.visitsInProgress}</Td>
                    <Td align="right" className={k.storesLate + k.storesMissed ? "text-bad font-semibold" : ""}>{k.storesLate + k.storesMissed}</Td>
                    <Td align="right" className={openIssues ? "text-warn font-semibold" : ""}>{openIssues}</Td>
                    <Td align="right" className={openRuptures ? "text-bad font-semibold" : ""}>{openRuptures}</Td>
                    <Td className="text-muted whitespace-nowrap">{lastSyncAt ? fmtAgo(lastSyncAt) : "—"}</Td>
                    <Td align="right">
                      <form action={enterAgencyAction}>
                        <input type="hidden" name="agencyId" value={agency.id} />
                        <input type="hidden" name="next" value={date === todayIso() ? "/painel" : `/painel?date=${date}`} />
                        <button className={buttonClass("secondary", "sm")}>
                          Entrar <ArrowRight className="size-3.5" />
                        </button>
                      </form>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </SectionCard>
          <p className="text-[12px] text-muted mt-3 flex items-center gap-1.5">
            <Users className="size-3.5" /> Promotores = com atividade registrada / programados no dia. Pendências e lojas seguem as mesmas regras do painel de cada agência.
          </p>
        </>
      )}
    </>
  );
}
