"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { createLeadAction, updateLeadAction } from "@/app/actions";
import { LEAD_SOURCES, LEAD_TYPES, PRODUCTS, formatMoney, parseMoney, potentialValue } from "@/lib/crm";

export interface LeadFormValues {
  id: string;
  company: string;
  type: string;
  city: string | null;
  region: string | null;
  source: string;
  referredBy: string | null;
  dataSource: string | null;
  products: string[];
  promoters: number | null;
  actionsPerMonth: number | null;
  potentialCents: number | null;
  potentialManual: boolean;
  clientId: string | null;
  ownerId: string;
  tags: string[];
  notes: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
}

const digits = (v: string) => v.replace(/\D/g, "");

export function LeadForm({ lead, people, clients, userId, today, needsNext = true }: { lead?: LeadFormValues; people: { id: string; name: string }[]; clients: { id: string; name: string }[]; userId: string; today: string; needsNext?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; number: number; title: string } | null>(null);
  const [f, setF] = useState({
    company: lead?.company ?? "",
    type: lead?.type ?? LEAD_TYPES[0],
    city: lead?.city ?? "",
    region: lead?.region ?? "",
    source: lead?.source ?? LEAD_SOURCES[0],
    referredBy: lead?.referredBy ?? "",
    dataSource: lead?.dataSource ?? "",
    products: lead?.products ?? ([] as string[]),
    promoters: lead?.promoters != null ? String(lead.promoters) : "",
    actions: lead?.actionsPerMonth != null ? String(lead.actionsPerMonth) : "",
    manualValue: lead?.potentialManual && lead.potentialCents != null ? String(lead.potentialCents / 100).replace(".", ",") : "",
    clientId: lead?.clientId ?? "",
    ownerId: lead?.ownerId ?? (people.some((p) => p.id === userId) ? userId : (people[0]?.id ?? "")),
    tags: (lead?.tags ?? []).join(", "),
    notes: lead?.notes ?? "",
    nextAction: lead?.nextAction ?? (lead ? "" : "Fazer o primeiro contato"),
    nextActionDate: lead?.nextActionDate ?? today,
    contactName: "",
    contactRole: "",
    contactWhatsapp: "",
    contactEmail: "",
  });
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((prev) => ({ ...prev, [key]: value }));
  const auto = potentialValue(f.products, Number(f.promoters) || null, Number(f.actions) || null);

  function submit(confirmDuplicate: boolean) {
    setError(null);
    setSaved(null);
    const input = {
      company: f.company,
      type: f.type,
      city: f.city,
      region: f.region,
      source: f.source,
      referredBy: f.referredBy,
      dataSource: f.dataSource,
      products: f.products,
      promoters: f.promoters ? Number(f.promoters) : null,
      actionsPerMonth: f.actions ? Number(f.actions) : null,
      potentialCents: f.manualValue.trim() ? parseMoney(f.manualValue) : null,
      clientId: f.clientId || null,
      ownerId: f.ownerId,
      tags: f.tags.split(","),
      notes: f.notes,
      nextAction: f.nextAction,
      nextActionDate: f.nextActionDate,
      contact: lead ? null : { name: f.contactName, role: f.contactRole, whatsapp: f.contactWhatsapp, email: f.contactEmail },
    };
    start(async () => {
      if (lead) {
        const result = await updateLeadAction(lead.id, input);
        if (!result.ok) return setError(result.error);
        setSaved(result.message ?? "Salvo.");
        return router.refresh();
      }
      const result = await createLeadAction(input, confirmDuplicate);
      if (!result.ok) {
        setDuplicate((result as { duplicate?: { id: string; number: number; title: string } }).duplicate ?? null);
        return setError(result.error);
      }
      router.push(`/comercial/leads/${result.id}`);
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="lf-company">Empresa</label>
          <input id="lf-company" className="field" value={f.company} onChange={(e) => set("company", e.target.value)} required minLength={2} />
        </div>
        <div>
          <label className="label" htmlFor="lf-type">Tipo</label>
          <select id="lf-type" className="field" value={f.type} onChange={(e) => set("type", e.target.value)}>
            {LEAD_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="lf-city">Cidade</label>
          <input id="lf-city" className="field" value={f.city} onChange={(e) => set("city", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="lf-region">Região</label>
          <input id="lf-region" className="field" value={f.region} onChange={(e) => set("region", e.target.value)} placeholder="Ex.: Grande BH" />
        </div>
        <div>
          <label className="label" htmlFor="lf-owner">Responsável</label>
          <select id="lf-owner" className="field" value={f.ownerId} onChange={(e) => set("ownerId", e.target.value)} required>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="lf-source">Origem</label>
          <select id="lf-source" className="field" value={f.source} onChange={(e) => set("source", e.target.value)}>
            {LEAD_SOURCES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        {f.source === "Indicação" && (
          <div>
            <label className="label" htmlFor="lf-ref">Indicado por (cliente, marca ou pessoa)</label>
            <input id="lf-ref" className="field" value={f.referredBy} onChange={(e) => set("referredBy", e.target.value)} required />
          </div>
        )}
        <div>
          <label className="label" htmlFor="lf-data">De onde veio o contato (LGPD)</label>
          <input id="lf-data" className="field" value={f.dataSource} onChange={(e) => set("dataSource", e.target.value)} placeholder="Ex.: site da empresa, indicação" />
        </div>
        <div>
          <label className="label" htmlFor="lf-client">Expansão em contratante atual</label>
          <select id="lf-client" className="field" value={f.clientId} onChange={(e) => set("clientId", e.target.value)}>
            <option value="">Não — é empresa nova</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="label">Produtos de interesse</legend>
        <div className="flex flex-wrap gap-2">
          {PRODUCTS.map((p) => (
            <button key={p} type="button" aria-pressed={f.products.includes(p)} className={clsx("chip", f.products.includes(p) && "chip-on")} onClick={() => set("products", f.products.includes(p) ? f.products.filter((x) => x !== p) : [...f.products, p])}>
              {p}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="lf-prom">Nº de promotores</label>
          <input id="lf-prom" className="field" inputMode="numeric" value={f.promoters} onChange={(e) => set("promoters", digits(e.target.value))} />
        </div>
        <div>
          <label className="label" htmlFor="lf-act">Ações por mês</label>
          <input id="lf-act" className="field" inputMode="numeric" value={f.actions} onChange={(e) => set("actions", digits(e.target.value))} />
        </div>
        <div>
          <label className="label" htmlFor="lf-value">Valor mensal (R$) — deixe vazio para calcular</label>
          <input id="lf-value" className="field" inputMode="decimal" value={f.manualValue} onChange={(e) => set("manualValue", e.target.value)} placeholder={auto.cents ? String(auto.cents / 100).replace(".", ",") : ""} />
        </div>
      </div>
      <p className="text-xs text-muted">
        Potencial pela tabela: <strong className="text-ink-2">{formatMoney(auto.cents)}/mês</strong>
        {f.products.includes("Backoffice") && " (Backoffice pelo piso de R$ 1.250)"}
        {auto.underProposal.length > 0 && ` · fora da soma, sob proposta: ${auto.underProposal.join("; ")}`}
      </p>

      {!lead && (
        <fieldset className="rounded-lg border border-line p-3">
          <legend className="px-1 text-xs font-semibold text-ink-2">Contato principal (só dados profissionais)</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="lf-cn">Nome</label>
              <input id="lf-cn" className="field" value={f.contactName} onChange={(e) => set("contactName", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="lf-cr">Cargo</label>
              <input id="lf-cr" className="field" value={f.contactRole} onChange={(e) => set("contactRole", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="lf-cw">WhatsApp (com DDD)</label>
              <input id="lf-cw" className="field" inputMode="tel" value={f.contactWhatsapp} onChange={(e) => set("contactWhatsapp", e.target.value)} placeholder="(31) 9 0000-0000" />
            </div>
            <div>
              <label className="label" htmlFor="lf-ce">E-mail</label>
              <input id="lf-ce" type="email" className="field" value={f.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
            </div>
          </div>
        </fieldset>
      )}

      {needsNext && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="lf-next">Próxima ação (obrigatória)</label>
            <input id="lf-next" className="field" value={f.nextAction} onChange={(e) => set("nextAction", e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="lf-nd">Data da próxima ação</label>
            <input id="lf-nd" type="date" className="field" value={f.nextActionDate} onChange={(e) => set("nextActionDate", e.target.value)} required />
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="lf-tags">Tags (separadas por vírgula)</label>
          <input id="lf-tags" className="field" value={f.tags} onChange={(e) => set("tags", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="lf-notes">Observações</label>
          <input id="lf-notes" className="field" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>

      {error && (
        <div role="alert" className="space-y-2 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">
          <p>{error}</p>
          {duplicate && (
            <p className="flex flex-wrap gap-3">
              <Link href={`/comercial/leads/${duplicate.id}`} className="font-semibold underline underline-offset-2">Abrir o lead existente</Link>
              <button type="button" className="font-semibold underline underline-offset-2" onClick={() => submit(true)}>Cadastrar mesmo assim</button>
            </p>
          )}
        </div>
      )}
      {saved && <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">{saved}</p>}
      <button className="btn-primary" disabled={pending}>{lead ? "Salvar lead" : "Cadastrar lead"}</button>
    </form>
  );
}
