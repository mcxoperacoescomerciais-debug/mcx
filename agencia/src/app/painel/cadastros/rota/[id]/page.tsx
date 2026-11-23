import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getScope, requireRole } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { listAssignments } from "@/server/portfolio";
import { addDays, fmtDate, todayIso, weekdayOf } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/ui";
import { SectionCard, Table, Td, Th } from "../../../_components/widgets";
import { PromoterAssignments } from "./promoter-assignments";
import { PromoterSwitcher } from "../promoter-switcher";
import { CancelOnceButton } from "./cancel-once";

export const metadata: Metadata = { title: "Rota Promotor" };

const WEEKDAY = ["Dom.", "Seg.", "Ter.", "Qua.", "Qui.", "Sex.", "Sáb."];
const ONCE_DAYS = 60;

/**
 * Rota do promotor: a rota fixa (lojas, marcas, dias e vezes — gera a
 * programação, a carteira e as metas) e a rota avulsa (visitas programadas só
 * para um dia, como a transferência avulsa de outro promotor).
 */
export default async function PromoterRoutePage({ params }: PageProps<"/painel/cadastros/rota/[id]">) {
  await requireRole(["admin"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const scope = await getScope();
  const db = await getDb();
  const [user] = await db.select().from(s.users).where(and(eq(s.users.id, id), eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "promoter")));
  if (!user) notFound();
  const today = todayIso();

  const [brands, stores, storeBrandRows, assignments, promoterList, once] = await Promise.all([
    db.select({ id: s.brands.id, name: s.brands.name }).from(s.brands).where(and(eq(s.brands.agencyId, scope.agencyId), eq(s.brands.status, "active"))).orderBy(asc(s.brands.name)),
    db
      .select({ id: s.stores.id, name: s.stores.name, code: s.stores.code, city: s.stores.city, chain: s.chains.name })
      .from(s.stores)
      .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
      .where(and(eq(s.stores.agencyId, scope.agencyId), eq(s.stores.status, "active")))
      .orderBy(asc(s.stores.name)),
    db
      .select({ storeId: s.storeBrands.storeId, brandId: s.brands.id, brandName: s.brands.name })
      .from(s.storeBrands)
      .innerJoin(s.brands, and(eq(s.brands.id, s.storeBrands.brandId), eq(s.brands.status, "active")))
      .where(eq(s.brands.agencyId, scope.agencyId)),
    listAssignments(scope, user.id),
    db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "promoter"), eq(s.users.status, "active"))).orderBy(asc(s.users.name)),
    // Rota avulsa: programações de um dia só (feitas à mão ou por transferência avulsa).
    db
      .select({ id: s.schedules.id, date: s.schedules.date, notes: s.schedules.notes, store: s.stores.name, city: s.stores.city, chain: s.chains.name })
      .from(s.schedules)
      .innerJoin(s.stores, eq(s.stores.id, s.schedules.storeId))
      .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
      .where(and(eq(s.schedules.promoterId, user.id), eq(s.schedules.status, "active"), eq(s.schedules.origin, "manual"), gte(s.schedules.date, today), lte(s.schedules.date, addDays(today, ONCE_DAYS))))
      .orderBy(asc(s.schedules.date), asc(s.schedules.seq)),
  ]);
  const onceBrands = once.length
    ? await db
        .select({ scheduleId: s.scheduleBrands.scheduleId, name: s.brands.name })
        .from(s.scheduleBrands)
        .innerJoin(s.brands, eq(s.brands.id, s.scheduleBrands.brandId))
        .where(inArray(s.scheduleBrands.scheduleId, once.map((o) => o.id)))
        .orderBy(asc(s.brands.name))
    : [];
  const storeOptions = stores.map((st) => ({
    id: st.id,
    name: st.name,
    code: st.code,
    chain: st.chain,
    city: st.city,
    brands: storeBrandRows
      .filter((r) => r.storeId === st.id)
      .map((r) => ({ id: r.brandId, name: r.brandName }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  }));

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/painel/cadastros/rota" className="hover:underline">
            Rota Promotor
          </Link>
        }
        title={user.name}
        subtitle={`${user.status === "active" ? "Ativo" : "Inativo"}${user.region ? ` · ${user.region}` : ""} · rota fixa e rota avulsa`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PromoterSwitcher promoters={promoterList} current={user.id} />
            <Link href={`/painel/cadastros/usuarios/${user.id}`} className="text-[13px] font-semibold text-brand-700 hover:underline">
              Cadastro do usuário →
            </Link>
          </div>
        }
      />

      <SectionCard
        title="Rota fixa — lojas, marcas, dias e vezes"
        subtitle="Selecione a loja, escolha as marcas que ele atende nela e, para cada marca, os dias e quantas vezes. É isso que gera a programação, a carteira e as metas dele."
        bodyClass="px-5 pb-5"
      >
        <PromoterAssignments promoterId={user.id} promoters={promoterList} stores={storeOptions} allBrands={brands} assignments={assignments.map((a) => ({ storeId: a.storeId, brands: a.brands }))} />
      </SectionCard>

      <SectionCard
        className="mt-6"
        title={`Rota avulsa — próximos ${ONCE_DAYS} dias (${once.length})`}
        subtitle="Visitas só para um dia: transferência avulsa de outro promotor ou programação feita à mão. Entram na previsão do dia, no relatório mensal e no cumprimento deste promotor."
        bodyClass="pb-2"
      >
        {once.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Loja</Th>
                <Th>Marcas</Th>
                <Th>Observação</Th>
                <Th align="right"> </Th>
              </tr>
            </thead>
            <tbody>
              {once.map((o) => (
                <tr key={o.id}>
                  <Td className="whitespace-nowrap font-semibold">
                    {WEEKDAY[weekdayOf(o.date)]} {fmtDate(o.date)}
                  </Td>
                  <Td>
                    <span className="font-semibold">{o.store}</span>
                    <span className="block text-[12px] text-muted">{[o.chain, o.city].filter(Boolean).join(" · ")}</span>
                  </Td>
                  <Td>{onceBrands.filter((b) => b.scheduleId === o.id).map((b) => b.name).join(", ") || "—"}</Td>
                  <Td className="text-[12.5px] text-muted">{o.notes ?? ""}</Td>
                  <Td align="right">
                    <CancelOnceButton scheduleId={o.id} promoterId={user.id} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhuma visita avulsa programada">Use “Transferir” › “Avulsa” na rota de outro promotor, ou a Programação, para colocar uma visita de um dia só.</EmptyState>
        )}
      </SectionCard>
    </>
  );
}
