"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { addBrandAction, addContactAction, removeBrandAction, removeContactAction, saveClientAction } from "@/app/actions";
import { useRun } from "@/components/use-run";
import type { ClientKind } from "@/lib/domain";

interface ClientValues {
  id: string;
  name: string;
  kind: ClientKind;
  document: string | null;
  status: "active" | "inactive";
  notes: string | null;
  monthlyValueCents: number | null;
}

export function ClientForm({ client, showValue = false }: { client?: ClientValues; showValue?: boolean }) {
  const router = useRouter();
  const { run, pending, message } = useRun();
  const [name, setName] = useState(client?.name ?? "");
  const [kind, setKind] = useState<ClientKind>(client?.kind ?? "agency");
  const [document, setDocument] = useState(client?.document ?? "");
  const [status, setStatus] = useState(client?.status ?? "active");
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [value, setValue] = useState(client?.monthlyValueCents == null ? "" : (client.monthlyValueCents / 100).toFixed(2).replace(".", ","));
  const valueCents = () => {
    const v = value.trim().replace(/\./g, "").replace(",", ".");
    return v === "" ? null : Math.round(Number(v) * 100);
  };
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await saveClientAction(client?.id ?? null, { name, kind, document, status, notes, ...(showValue ? { monthlyValueCents: valueCents() } : {}) });
          if (r.ok && !client && "id" in r) router.push(`/contratantes/${r.id}`);
          return r;
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="c-name">Nome</label>
          <input id="c-name" className="field" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </div>
        <div>
          <label className="label" htmlFor="c-kind">Tipo</label>
          <select id="c-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as ClientKind)}>
            <option value="agency">Agência</option>
            <option value="rep">Representante</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="c-doc">CNPJ/CPF (opcional)</label>
          <input id="c-doc" className="field" value={document} onChange={(e) => setDocument(e.target.value)} />
        </div>
        {client && (
          <div>
            <label className="label" htmlFor="c-status">Status</label>
            <select id="c-status" className="field" value={status} onChange={(e) => setStatus(e.target.value as "active" | "inactive")}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
        )}
      </div>
      {showValue && (
        <div className="sm:max-w-xs">
          <label className="label" htmlFor="c-value">Valor mensal do contrato em R$ (opcional)</label>
          <input id="c-value" className="field" inputMode="decimal" placeholder="Ex.: 1.450,00" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="c-notes">Observações</label>
        <textarea id="c-notes" className="field min-h-20 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {message}
      <button className="btn-primary" disabled={pending}>{client ? "Salvar" : "Criar contratante"}</button>
    </form>
  );
}

export function Brands({ clientId, brands, editable }: { clientId: string; brands: { id: string; name: string }[]; editable: boolean }) {
  const { run, pending, message } = useRun();
  const [name, setName] = useState("");
  return (
    <div className="space-y-3">
      {brands.length === 0 && <p className="text-sm text-muted">Nenhuma marca cadastrada.</p>}
      <ul className="flex flex-wrap gap-2">
        {brands.map((b) => (
          <li key={b.id} className="chip gap-1">
            {b.name}
            {editable && (
              <button type="button" aria-label={`Remover ${b.name}`} className="rounded-full p-0.5 text-muted hover:text-bad" disabled={pending} onClick={() => run(() => removeBrandAction(b.id))}>
                <X aria-hidden className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addBrandAction(clientId, name), () => setName(""));
          }}
        >
          <label className="sr-only" htmlFor="b-new">Nova marca</label>
          <input id="b-new" className="field" placeholder="Nova marca" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          <button className="btn-ghost shrink-0" disabled={pending}>Adicionar</button>
        </form>
      )}
      {message}
    </div>
  );
}

export function Contacts({ clientId, contacts, editable }: { clientId: string; contacts: { id: string; name: string; role: string | null; whatsapp: string | null; email: string | null }[]; editable: boolean }) {
  const { run, pending, message } = useRun();
  const empty = { name: "", role: "", whatsapp: "", email: "" };
  const [f, setF] = useState(empty);
  return (
    <div className="space-y-3">
      {contacts.length === 0 && <p className="text-sm text-muted">Nenhum contato cadastrado.</p>}
      <ul className="space-y-2">
        {contacts.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-2 rounded-lg bg-subtle px-3 py-2 text-sm">
            <div>
              <p className="font-semibold text-ink">{c.name}{c.role && <span className="font-normal text-muted"> · {c.role}</span>}</p>
              <p className="text-xs text-ink-2">{[c.whatsapp, c.email].filter(Boolean).join(" · ") || "Sem telefone ou e-mail"}</p>
            </div>
            {editable && (
              <button type="button" aria-label={`Remover ${c.name}`} className="rounded-lg p-1.5 text-muted hover:bg-bad-bg hover:text-bad" disabled={pending} onClick={() => run(() => removeContactAction(c.id))}>
                <X aria-hidden className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addContactAction(clientId, f), () => setF(empty));
          }}
        >
          <input aria-label="Nome do contato" className="field" placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} />
          <input aria-label="Função" className="field" placeholder="Função" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
          <input aria-label="WhatsApp" className="field" placeholder="WhatsApp" inputMode="tel" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} />
          <input aria-label="E-mail" type="email" className="field" placeholder="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <button className="btn-ghost sm:col-span-2 sm:justify-self-start" disabled={pending}>Adicionar contato</button>
        </form>
      )}
      {message}
    </div>
  );
}
