"use client";
/** Painéis da ficha do lead: etapa, próxima ação, mensagem no WhatsApp, interação, contatos e exclusão. */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addInteractionAction, addLeadContactAction, deleteLeadAction, openWhatsappAction, removeLeadContactAction, setContactOptOutAction, setNextActionAction } from "@/app/actions";
import { MoveDialog, type MoveLead, type MoveTarget } from "@/components/crm/move-dialog";
import { useRun } from "@/components/use-run";
import { INTERACTION_KINDS, INTERACTION_KIND_LABEL, OUTCOMES, OUTCOME_LABEL, missingVars, type InteractionKind, type Outcome } from "@/lib/crm";

export function StageMover({ lead, stages, stageId, today, locked }: { lead: MoveLead; stages: MoveTarget[]; stageId: string; today: string; locked: boolean }) {
  const router = useRouter();
  const [target, setTarget] = useState<MoveTarget | null>(null);
  const [note, setNote] = useState<string | null>(null);
  return (
    <div>
      <label className="label" htmlFor="ld-move">Etapa do funil</label>
      <select id="ld-move" className="field" value={stageId} disabled={locked} onChange={(e) => setTarget(stages.find((st) => st.id === e.target.value && st.id !== stageId) ?? null)}>
        {stages.map((st) => (
          <option key={st.id} value={st.id}>{st.name}</option>
        ))}
      </select>
      {locked && <p className="mt-1 text-xs text-muted">Lead ganho: o contratante e a implantação já foram criados.</p>}
      {note && <p role="status" className="mt-2 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">{note}</p>}
      {target && (
        <MoveDialog
          lead={lead}
          target={target}
          today={today}
          onClose={() => setTarget(null)}
          onDone={(text) => {
            setTarget(null);
            setNote(text);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

export function NextActionForm({ leadId, nextAction, nextActionDate }: { leadId: string; nextAction: string | null; nextActionDate: string | null }) {
  const { run, pending, message } = useRun();
  const [action, setAction] = useState(nextAction ?? "");
  const [date, setDate] = useState(nextActionDate ?? "");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setNextActionAction(leadId, action, date));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="na-action">Próxima ação</label>
          <input id="na-action" className="field" value={action} onChange={(e) => setAction(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="na-date">Data</label>
          <input id="na-date" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
      </div>
      {message}
      <button className="btn-ghost" disabled={pending}>Atualizar próxima ação</button>
    </form>
  );
}

interface Suggest {
  nextAction: string;
  nextActionDate: string;
  suggestClose: boolean;
}

function NextFields({ id, action, date, setAction, setDate, suggest }: { id: string; action: string; date: string; setAction: (v: string) => void; setDate: (v: string) => void; suggest: Suggest }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`${id}-next`}>Próxima ação (obrigatória)</label>
          <input id={`${id}-next`} className="field" value={action} onChange={(e) => setAction(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-date`}>Data</label>
          <input id={`${id}-date`} type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
      </div>
      {suggest.suggestClose && <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">Já foram os contatos do D0, D+3 e D+7 sem resposta. Sugestão: mover para Nutrição (retomada em 30 dias) ou Perdido, no seletor de etapa.</p>}
    </>
  );
}

export function WhatsappPanel({ leadId, contacts, templates, open, suggest }: { leadId: string; contacts: { id: string; name: string; hasWhatsapp: boolean; optOut: boolean }[]; templates: { id: string; name: string; stageName: string | null; draft: boolean; forStage: boolean; texts: Record<string, string> }[]; open: boolean; suggest: Suggest }) {
  const router = useRouter();
  const usable = contacts.filter((c) => c.hasWhatsapp && !c.optOut);
  const [pending, start] = useTransition();
  const [contactId, setContactId] = useState(usable[0]?.id ?? "");
  const firstTemplate = templates.find((t) => t.forStage) ?? null;
  const [templateId, setTemplateId] = useState(firstTemplate?.id ?? "");
  const [text, setText] = useState(firstTemplate && usable[0] ? (firstTemplate.texts[usable[0].id] ?? "") : "");
  const [action, setAction] = useState(suggest.nextAction);
  const [date, setDate] = useState(suggest.nextActionDate);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const template = templates.find((t) => t.id === templateId);
  const missing = missingVars(text);

  function pick(nextTemplate: string, nextContact: string) {
    setTemplateId(nextTemplate);
    setContactId(nextContact);
    const tpl = templates.find((t) => t.id === nextTemplate);
    if (tpl) setText(tpl.texts[nextContact] ?? "");
  }

  if (usable.length === 0) return <p className="text-sm text-muted">Cadastre um contato com WhatsApp (e sem pedido de não receber mensagens) para usar a mensagem pronta.</p>;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setLink(null);
        // A aba é aberta já no clique (antes da resposta do servidor) para o navegador não bloquear.
        const tab = window.open("about:blank", "_blank");
        start(async () => {
          const result = await openWhatsappAction(leadId, { contactId, templateId: templateId || null, text, nextAction: open ? action : null, nextActionDate: open ? date : null });
          if (!result.ok) {
            tab?.close();
            return setError(result.error);
          }
          if (tab) tab.location.href = result.url;
          setLink(result.url);
          router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="wa-contact">Contato</label>
          <select id="wa-contact" className="field" value={contactId} onChange={(e) => pick(templateId, e.target.value)}>
            {usable.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="wa-tpl">Modelo</label>
          <select id="wa-tpl" className="field" value={templateId} onChange={(e) => pick(e.target.value, contactId)}>
            <option value="">Texto livre</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.stageName ? `${t.stageName} — ` : ""}{t.name}{t.draft ? " (rascunho)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      {template?.draft && <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">Modelo em rascunho, ainda a validar. Confira o texto antes de enviar.</p>}
      <div>
        <label className="label" htmlFor="wa-text">Mensagem (pode ajustar antes de abrir)</label>
        <textarea id="wa-text" className="field min-h-32 py-2" value={text} onChange={(e) => setText(e.target.value)} required />
        {missing.length > 0 && <p className="mt-1 text-xs font-semibold text-bad">Falta preencher: {missing.map((m) => `{${m}}`).join(", ")}</p>}
      </div>
      {open && <NextFields id="wa" action={action} date={date} setAction={setAction} setDate={setDate} suggest={suggest} />}
      {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
      {link && (
        <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">
          Interação registrada. Se o WhatsApp não abriu,{" "}
          <a href={link} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">abra por aqui</a>.
        </p>
      )}
      <button className="btn-primary" disabled={pending || missing.length > 0}>Abrir no WhatsApp e registrar</button>
      <p className="text-xs text-muted">O sistema só monta o texto e abre o seu WhatsApp. Quem envia é você.</p>
    </form>
  );
}

export function InteractionForm({ leadId, open, suggest }: { leadId: string; open: boolean; suggest: Suggest }) {
  const { run, pending, message } = useRun();
  const [kind, setKind] = useState<InteractionKind>("whatsapp");
  const [outcome, setOutcome] = useState<Outcome>("no_answer");
  const [summary, setSummary] = useState("");
  const [action, setAction] = useState(suggest.nextAction);
  const [date, setDate] = useState(suggest.nextActionDate);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => addInteractionAction(leadId, { kind, summary, outcome, nextAction: open ? action : null, nextActionDate: open ? date : null }),
          () => setSummary(""),
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="in-kind">Tipo</label>
          <select id="in-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as InteractionKind)}>
            {INTERACTION_KINDS.map((k) => (
              <option key={k} value={k}>{INTERACTION_KIND_LABEL[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="in-outcome">Resultado</label>
          <select id="in-outcome" className="field" value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>
            {OUTCOMES.filter((o) => o !== "sent").map((o) => (
              <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="in-summary">Resumo curto</label>
        <input id="in-summary" className="field" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Ex.: Ligou de volta, quer ver o painel na quinta" required minLength={3} />
      </div>
      {open && <NextFields id="in" action={action} date={date} setAction={setAction} setDate={setDate} suggest={suggest} />}
      {message}
      <button className="btn-primary" disabled={pending}>Registrar interação</button>
    </form>
  );
}

export function ContactsPanel({ leadId, contacts }: { leadId: string; contacts: { id: string; name: string; role: string | null; whatsapp: string | null; email: string | null; isPrimary: boolean; optOut: boolean }[] }) {
  const { run, pending, message } = useRun();
  const [f, setF] = useState({ name: "", role: "", whatsapp: "", email: "" });
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {contacts.length === 0 && <li className="text-sm text-muted">Nenhum contato cadastrado.</li>}
        {contacts.map((c) => (
          <li key={c.id} className="rounded-lg border border-line p-3 text-sm">
            <p className="font-semibold text-ink">
              {c.name}
              {c.isPrimary && <span className="ml-2 text-xs font-normal text-muted">principal</span>}
              {c.optOut && <span className="ml-2 rounded-full bg-bad-bg px-2 py-0.5 text-xs font-semibold text-bad">Não enviar mensagens</span>}
            </p>
            <p className="text-xs text-muted">{[c.role, c.whatsapp, c.email].filter(Boolean).join(" · ") || "Sem dados de contato"}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
              <button type="button" className="text-brand-700 underline underline-offset-2" disabled={pending} onClick={() => run(() => setContactOptOutAction(c.id, !c.optOut))}>
                {c.optOut ? "Liberar mensagens" : "Pediu para não receber mensagens"}
              </button>
              <button
                type="button"
                className="text-bad underline underline-offset-2"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Excluir o contato ${c.name}? Os dados dele são apagados de verdade e não voltam.`)) run(() => removeLeadContactAction(c.id));
                }}
              >
                Excluir contato
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => addLeadContactAction(leadId, f),
            () => setF({ name: "", role: "", whatsapp: "", email: "" }),
          );
        }}
      >
        <input aria-label="Nome do contato" className="field" placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <input aria-label="Cargo" className="field" placeholder="Cargo" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
        <input aria-label="WhatsApp com DDD" className="field" inputMode="tel" placeholder="WhatsApp (com DDD)" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} />
        <input aria-label="E-mail" type="email" className="field" placeholder="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <button className="btn-ghost sm:col-span-2" disabled={pending}>Adicionar contato</button>
      </form>
      {message}
    </div>
  );
}

export function DeleteLead({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-bad">Excluir lead</summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const result = await deleteLeadAction(leadId, reason);
            if (!result.ok) return setError(result.error);
            router.push("/comercial/leads");
          });
        }}
      >
        <p className="text-xs text-muted">O lead sai das listas e os dados de contato são apagados de verdade. O motivo fica na auditoria.</p>
        <label className="label" htmlFor="dl-reason">Motivo</label>
        <input id="dl-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />
        {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
        <button className="btn-danger" disabled={pending}>Excluir lead</button>
      </form>
    </details>
  );
}
