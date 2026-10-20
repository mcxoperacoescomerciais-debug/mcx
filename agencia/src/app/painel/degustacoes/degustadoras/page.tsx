import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, X } from "lucide-react";
import { getScope } from "@/server/auth";
import { canManageTastings, listTasters } from "@/server/tastings";
import { brl } from "@/lib/tasting";
import { fmtDate } from "@/lib/dates";
import { Badge, EmptyState, LinkButton, PageHeader, buttonClass, inputClass, selectClass } from "@/components/ui";
import { Table, Td, Th } from "../../_components/widgets";
import { DegTabs } from "../_components/deg-tabs";

export const metadata: Metadata = { title: "Degustadoras" };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

export default async function TastersPage({ searchParams }: PageProps<"/painel/degustacoes/degustadoras">) {
  const scope = await getScope();
  if (scope.role === "promoter") notFound();
  const sp = await searchParams;
  const f = { q: one(sp.q), city: one(sp.city), region: one(sp.region), availability: one(sp.disp), status: one(sp.status) };
  const rows = await listTasters(scope, f);
  return (
    <>
      <DegTabs />
      <PageHeader
        title="Degustadoras"
        subtitle={`${rows.length} cadastro(s) · estar cadastrada não significa estar disponível: confirme cada evento`}
        actions={
          canManageTastings(scope) ? (
            <LinkButton href="/painel/degustacoes/degustadoras/nova">
              <Plus className="size-4" /> Nova degustadora
            </LinkButton>
          ) : null
        }
      />
      <form method="get" className="grid grid-cols-2 lg:grid-cols-6 gap-2 mb-5">
        <input name="q" defaultValue={f.q} placeholder="Nome ou WhatsApp" className={inputClass} aria-label="Nome" />
        <input name="city" defaultValue={f.city} placeholder="Cidade" className={inputClass} aria-label="Cidade" />
        <input name="region" defaultValue={f.region} placeholder="Região" className={inputClass} aria-label="Região" />
        <input name="disp" defaultValue={f.availability} placeholder="Disponibilidade (ex.: sáb)" className={inputClass} aria-label="Disponibilidade" />
        <select name="status" defaultValue={f.status} className={selectClass} aria-label="Situação">
          <option value="">Ativas</option>
          <option value="inactive">Inativas</option>
          <option value="all">Todas</option>
        </select>
        <div className="flex gap-2">
          <button className={buttonClass("primary") + " flex-1"}>Buscar</button>
          <Link href="/painel/degustacoes/degustadoras" className={buttonClass("secondary")} aria-label="Limpar">
            <X className="size-4" />
          </Link>
        </div>
      </form>
      <div className="bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden">
        {rows.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Cidade · região</Th>
                <Th>Disponibilidade habitual</Th>
                <Th>Experiência</Th>
                <Th align="right">Valor habitual</Th>
                <Th align="right">Realizadas</Th>
                <Th>Próxima</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="hover:bg-subtle">
                  <Td>
                    <Link href={`/painel/degustacoes/degustadoras/${t.id}`} className="font-semibold hover:underline">
                      {t.name}
                    </Link>
                    {t.sample ? <Badge className="ml-1.5">Exemplo</Badge> : null}
                    {t.status === "inactive" ? <Badge className="ml-1.5">Inativa</Badge> : null}
                    <span className="block text-[11.5px] text-muted">{t.phone ? `+${t.phone}` : "sem WhatsApp"}</span>
                  </Td>
                  <Td>
                    {t.city}/{t.state}
                    {t.region ? <span className="block text-[11.5px] text-muted">{t.region}</span> : null}
                  </Td>
                  <Td className="text-[13px]">{t.availability ?? "—"}</Td>
                  <Td className="text-[13px]">{t.experience ?? "—"}</Td>
                  <Td align="right" className="tnum">{brl(t.usualFee)}</Td>
                  <Td align="right" className="tnum">{t.events}</Td>
                  <Td className="tnum text-[13px]">{t.next ? fmtDate(t.next) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhuma degustadora encontrada">Cadastre as degustadoras que trabalham ou podem trabalhar com a agência.</EmptyState>
        )}
      </div>
    </>
  );
}
