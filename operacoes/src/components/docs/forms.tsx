"use client";
/** Formulários de contratos, documentos e ficha operacional. */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAmendmentAction, deleteContractAction, deleteDocumentAction, saveClientProfileAction, saveContractAction, updateDocumentAction } from "@/app/actions";
import { useRun } from "@/components/use-run";
import { parseMoney } from "@/lib/crm";
import { ACCEPTED_EXTENSIONS, ALWAYS_RESTRICTED, CONTRACT_STATUSES, CONTRACT_STATUS_LABEL, DOCUMENT_CATEGORIES, MAX_FILE_BYTES, PROFILE_SECTIONS, type ContractStatus } from "@/lib/documents";

const toMoney = (cents: number | null | undefined) => (cents ? (cents / 100).toFixed(2).replace(".", ",") : "");
const ACCEPT = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",") + ",.jpeg";

type Option = { id: string; name: string };

/** Envia pelo /api/documentos. Sem `documentId` cria o documento; com ele, cria uma versão nova. */
export function UploadForm({ documentId, clients = [], fixed = {}, canRestrict, defaultCategory = "Outros" }: { documentId?: string; clients?: Option[]; fixed?: { clientId?: string; contractId?: string }; canRestrict: boolean; defaultCategory?: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const categories = DOCUMENT_CATEGORIES.filter((c) => canRestrict || !ALWAYS_RESTRICTED.includes(c));
  const blank = { title: "", category: categories.includes(defaultCategory as never) ? defaultCategory : "Outros", clientId: fixed.clientId ?? "", brand: "", promoter: "", restricted: false, expiresOn: "" };
  const [f, setF] = useState(blank);
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((prev) => ({ ...prev, [key]: value }));
  const forced = ALWAYS_RESTRICTED.includes(f.category);
  const k = documentId ?? fixed.contractId ?? "novo";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setNote(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setNote({ ok: false, text: "Escolha o arquivo." });
    if (file.size > MAX_FILE_BYTES) return setNote({ ok: false, text: `Arquivo grande demais (máximo de ${MAX_FILE_BYTES / 1024 / 1024} MB).` });
    const body = new FormData();
    body.set("file", file);
    if (documentId) body.set("documentId", documentId);
    else {
      body.set("title", f.title);
      body.set("category", f.category);
      body.set("clientId", f.clientId);
      if (fixed.contractId) body.set("contractId", fixed.contractId);
      body.set("brand", f.brand);
      body.set("promoter", f.promoter);
      body.set("restricted", forced || f.restricted ? "1" : "0");
      body.set("expiresOn", f.expiresOn);
    }
    start(async () => {
      const result = await fetch("/api/documentos", { method: "POST", body })
        .then((r) => r.json() as Promise<{ ok: boolean; error?: string; message?: string; id?: string }>)
        .catch(() => ({ ok: false, error: "Não foi possível enviar. Confira a conexão e tente de novo.", message: undefined, id: undefined }));
      if (!result.ok) return setNote({ ok: false, text: result.error ?? "Não foi possível enviar." });
      setNote({ ok: true, text: result.message ?? "Enviado." });
      if (fileRef.current) fileRef.current.value = "";
      if (!documentId) setF(blank);
      router.refresh();
    });
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      {!documentId && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor={`up-title-${k}`}>Título</label>
            <input id={`up-title-${k}`} className="field" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex.: Tabela de preço Fini — nov/2026" required minLength={3} />
          </div>
          <div>
            <label className="label" htmlFor={`up-cat-${k}`}>Categoria</label>
            <select id={`up-cat-${k}`} className="field" value={f.category} onChange={(e) => set("category", e.target.value)}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {!fixed.clientId && !fixed.contractId && (
            <div>
              <label className="label" htmlFor={`up-cli-${k}`}>Contratante</label>
              <select id={`up-cli-${k}`} className="field" value={f.clientId} onChange={(e) => set("clientId", e.target.value)}>
                <option value="">Nenhum (interno)</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label" htmlFor={`up-brand-${k}`}>Marca (opcional)</label>
            <input id={`up-brand-${k}`} className="field" value={f.brand} onChange={(e) => set("brand", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={`up-prom-${k}`}>Promotor (opcional)</label>
            <input id={`up-prom-${k}`} className="field" value={f.promoter} onChange={(e) => set("promoter", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={`up-exp-${k}`}>Validade (opcional)</label>
            <input id={`up-exp-${k}`} type="date" className="field" value={f.expiresOn} onChange={(e) => set("expiresOn", e.target.value)} />
          </div>
        </div>
      )}
      <div>
        <label className="label" htmlFor={`up-file-${k}`}>{documentId ? "Nova versão do arquivo" : "Arquivo"} ({ACCEPTED_EXTENSIONS.join(", ")} · até {MAX_FILE_BYTES / 1024 / 1024} MB)</label>
        <input id={`up-file-${k}`} ref={fileRef} type="file" accept={ACCEPT} className="field py-2" required />
      </div>
      {!documentId && canRestrict && (
        <label className="flex min-h-10 items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" className="size-4" checked={forced || f.restricted} disabled={forced} onChange={(e) => set("restricted", e.target.checked)} /> Restrito — só gestor e dono leem{forced ? " (obrigatório nesta categoria)" : ""}
        </label>
      )}
      {note && <p role={note.ok ? "status" : "alert"} className={note.ok ? "rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok" : "rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad"}>{note.text}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Enviando…" : documentId ? "Enviar nova versão" : "Enviar documento"}</button>
    </form>
  );
}

export function DocumentMetaForm({ doc, clients }: { doc: { id: string; title: string; category: string; clientId: string | null; contractId: string | null; brand: string | null; promoter: string | null; restricted: boolean; expiresOn: string | null }; clients: Option[] }) {
  const { run, pending, message } = useRun();
  const [f, setF] = useState({ title: doc.title, category: doc.category, clientId: doc.clientId ?? "", brand: doc.brand ?? "", promoter: doc.promoter ?? "", restricted: doc.restricted, expiresOn: doc.expiresOn ?? "" });
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((prev) => ({ ...prev, [key]: value }));
  const forced = ALWAYS_RESTRICTED.includes(f.category);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateDocumentAction(doc.id, { title: f.title, category: f.category, clientId: f.clientId || null, contractId: doc.contractId, brand: f.brand, promoter: f.promoter, restricted: forced || f.restricted, expiresOn: f.expiresOn || null }));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="dm-title">Título</label>
          <input id="dm-title" className="field" value={f.title} onChange={(e) => set("title", e.target.value)} required minLength={3} />
        </div>
        <div>
          <label className="label" htmlFor="dm-cat">Categoria</label>
          <select id="dm-cat" className="field" value={f.category} onChange={(e) => set("category", e.target.value)}>
            {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {!doc.contractId && (
          <div>
            <label className="label" htmlFor="dm-cli">Contratante</label>
            <select id="dm-cli" className="field" value={f.clientId} onChange={(e) => set("clientId", e.target.value)}>
              <option value="">Nenhum (interno)</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="dm-brand">Marca</label>
          <input id="dm-brand" className="field" value={f.brand} onChange={(e) => set("brand", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="dm-prom">Promotor</label>
          <input id="dm-prom" className="field" value={f.promoter} onChange={(e) => set("promoter", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="dm-exp">Validade</label>
          <input id="dm-exp" type="date" className="field" value={f.expiresOn} onChange={(e) => set("expiresOn", e.target.value)} />
        </div>
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" className="size-4" checked={forced || f.restricted} disabled={forced} onChange={(e) => set("restricted", e.target.checked)} /> Restrito — só gestor e dono leem{forced ? " (obrigatório nesta categoria)" : ""}
      </label>
      {message}
      <button className="btn-ghost" disabled={pending}>Salvar dados</button>
    </form>
  );
}

export function DeleteWithReason({ kind, id, label, backTo }: { kind: "contract" | "document"; id: string; label: string; backTo: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-bad">{label}</summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const result = kind === "contract" ? await deleteContractAction(id, reason) : await deleteDocumentAction(id, reason);
            if (!result.ok) return setError(result.error);
            router.push(backTo);
          });
        }}
      >
        <p className="text-xs text-muted">Sai das listas, mas o registro e o arquivo continuam guardados. O motivo fica na auditoria.</p>
        <label className="label" htmlFor={`del-${id}`}>Motivo</label>
        <input id={`del-${id}`} className="field" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />
        {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
        <button className="btn-danger" disabled={pending}>{label}</button>
      </form>
    </details>
  );
}

export interface ContractValues {
  id: string;
  clientId: string;
  services: string;
  monthlyValueCents: number;
  dueDay: number | null;
  startDate: string | null;
  termMonths: number;
  autoRenew: boolean;
  status: ContractStatus;
  notes: string | null;
}

export function ContractForm({ contract, clients }: { contract?: ContractValues; clients: Option[] }) {
  const router = useRouter();
  const { run, pending, message } = useRun();
  const [f, setF] = useState({ clientId: contract?.clientId ?? "", services: contract?.services ?? "", value: toMoney(contract?.monthlyValueCents), dueDay: contract?.dueDay ? String(contract.dueDay) : "", startDate: contract?.startDate ?? "", termMonths: String(contract?.termMonths ?? 6), autoRenew: contract?.autoRenew ?? false, status: contract?.status ?? ("draft" as ContractStatus), notes: contract?.notes ?? "" });
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((prev) => ({ ...prev, [key]: value }));
  const locked = contract?.status === "active";
  const k = contract?.id ?? "novo";
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await saveContractAction(contract?.id ?? null, { clientId: f.clientId, services: f.services, monthlyValueCents: parseMoney(f.value) ?? 0, dueDay: f.dueDay ? Number(f.dueDay) : null, startDate: f.startDate || null, termMonths: Number(f.termMonths) || 6, autoRenew: f.autoRenew, status: f.status, notes: f.notes });
          if (r.ok && !contract && "id" in r) router.push(`/contratos/${r.id}`);
          return r;
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {!contract && (
          <div>
            <label className="label" htmlFor={`ct-cli-${k}`}>Contratante</label>
            <select id={`ct-cli-${k}`} className="field" value={f.clientId} onChange={(e) => set("clientId", e.target.value)} required>
              <option value="">Escolha…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`ct-serv-${k}`}>Serviços</label>
          <input id={`ct-serv-${k}`} className="field" value={f.services} onChange={(e) => set("services", e.target.value)} placeholder="Ex.: Backoffice + App MCX Trade" required minLength={3} />
        </div>
        <div>
          <label className="label" htmlFor={`ct-val-${k}`}>Valor mensal (R$)</label>
          <input id={`ct-val-${k}`} className="field" inputMode="decimal" value={f.value} disabled={locked} onChange={(e) => set("value", e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor={`ct-due-${k}`}>Dia de vencimento</label>
          <input id={`ct-due-${k}`} className="field" inputMode="numeric" value={f.dueDay} onChange={(e) => set("dueDay", e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </div>
        <div>
          <label className="label" htmlFor={`ct-start-${k}`}>Início</label>
          <input id={`ct-start-${k}`} type="date" className="field" value={f.startDate} disabled={locked} onChange={(e) => set("startDate", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor={`ct-term-${k}`}>Vigência (meses)</label>
          <input id={`ct-term-${k}`} className="field" inputMode="numeric" value={f.termMonths} disabled={locked} onChange={(e) => set("termMonths", e.target.value.replace(/\D/g, "").slice(0, 3))} />
        </div>
        <div>
          <label className="label" htmlFor={`ct-status-${k}`}>Status</label>
          <select id={`ct-status-${k}`} className="field" value={f.status} onChange={(e) => set("status", e.target.value as ContractStatus)}>
            {CONTRACT_STATUSES.map((st) => <option key={st} value={st}>{CONTRACT_STATUS_LABEL[st]}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="label" htmlFor={`ct-notes-${k}`}>Observações</label>
          <input id={`ct-notes-${k}`} className="field" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" className="size-4" checked={f.autoRenew} onChange={(e) => set("autoRenew", e.target.checked)} /> Renovação automática
      </label>
      {locked && <p className="text-xs text-muted">Contrato vigente: valor, início e vigência só mudam por aditivo (abaixo), para o histórico não se perder.</p>}
      {message}
      <button className="btn-primary" disabled={pending}>{contract ? "Salvar contrato" : "Criar contrato"}</button>
    </form>
  );
}

export function AmendmentForm({ contractId, today, valueCents, endDate }: { contractId: string; today: string; valueCents: number; endDate: string | null }) {
  const { run, pending, message } = useRun();
  const [f, setF] = useState({ day: today, description: "", value: toMoney(valueCents), endDate: endDate ?? "" });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addAmendmentAction(contractId, { day: f.day, description: f.description, newValueCents: parseMoney(f.value) ?? -1, newEndDate: f.endDate || null }), () => setF({ ...f, description: "" }));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="am-day">Data do aditivo</label>
          <input id="am-day" type="date" className="field" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="am-val">Novo valor mensal (R$)</label>
          <input id="am-val" className="field" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="am-end">Novo fim da vigência</label>
          <input id="am-end" type="date" className="field" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        </div>
        <div className="sm:col-span-3">
          <label className="label" htmlFor="am-desc">O que mudou</label>
          <input id="am-desc" className="field" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ex.: inclusão de 10 promotores no app; renovação por 6 meses" required minLength={3} />
        </div>
      </div>
      {message}
      <button className="btn-ghost" disabled={pending}>Registrar aditivo</button>
    </form>
  );
}

export function ProfileForm({ clientId, profile }: { clientId: string; profile: Record<string, string> }) {
  const { run, pending, message } = useRun();
  const [sections, setSections] = useState<Record<string, string>>(() => Object.fromEntries(PROFILE_SECTIONS.map((sec) => [sec.key, profile[sec.key] ?? ""])));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveClientProfileAction(clientId, sections));
      }}
    >
      {PROFILE_SECTIONS.map((sec) => (
        <div key={sec.key}>
          <label className="label" htmlFor={`pf-${sec.key}`}>{sec.label}</label>
          <textarea id={`pf-${sec.key}`} className="field min-h-16 py-2" value={sections[sec.key]} onChange={(e) => setSections({ ...sections, [sec.key]: e.target.value })} maxLength={4000} />
        </div>
      ))}
      <p className="text-xs text-muted">Nunca escreva senha aqui. Em “Onde está a credencial”, diga só onde ela fica (ex.: cofre de senhas da Maria).</p>
      {message}
      <button className="btn-primary" disabled={pending}>Salvar ficha</button>
    </form>
  );
}
