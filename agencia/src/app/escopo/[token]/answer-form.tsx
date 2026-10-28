"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageSquareWarning, X } from "lucide-react";
import clsx from "clsx";
import { LIMITS, type ResponseInput, type ScopeChoice, type ScopeSection } from "@/lib/scope-forms";
import { submitScopeAction } from "./actions";

type Draft = Omit<ResponseInput, "agree">;
const EMPTY: Draft = { answers: {}, generalNote: "", signerName: "", signerRole: "", signerEmail: "" };

const field =
  "w-full rounded-xl border border-[#cfd5e1] bg-white px-3.5 py-2.5 text-[15px] text-[#16203a] outline-none transition placeholder:text-[#9aa4b8] focus:border-[#000D36] focus:ring-2 focus:ring-[#000D36]/15";

export function ScopeAnswerForm({ token, sections, closingText }: { token: string; sections: ScopeSection[]; closingText: string | null }) {
  const router = useRouter();
  const storageKey = `mcx-escopo:${token}`;
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  // Rascunho no próprio navegador: fechar a página não perde o que já foi marcado.
  // Só grava depois de ler o que já havia, para não sobrescrever com o formulário vazio.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega o rascunho só depois de montar (evita divergência com o HTML do servidor)
      if (saved) setDraft({ ...EMPTY, ...JSON.parse(saved) });
    } catch {}
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {}
  }, [storageKey, draft, loaded]);

  const checklistIds = useMemo(() => sections.filter((s) => s.kind === "checklist").flatMap((s) => s.items.map((i) => i.id)), [sections]);
  const answered = checklistIds.filter((id) => {
    const a = draft.answers[id];
    return a?.choice === "ok" || a?.choice === "declined" || (a?.choice === "reservation" && a.note?.trim());
  }).length;

  const setAnswer = (id: string, patch: { choice?: ScopeChoice | ""; note?: string }) => {
    setDraft((d) => ({ ...d, answers: { ...d.answers, [id]: { ...d.answers[id], ...patch } } }));
    if (missing.has(id)) setMissing((m) => new Set([...m].filter((x) => x !== id)));
  };
  /** Clicar na opção já marcada desmarca o item. */
  const toggle = (id: string, choice: ScopeChoice) => setAnswer(id, { choice: draft.answers[id]?.choice === choice ? "" : choice });
  const markAllOk = (section: ScopeSection) => {
    setDraft((d) => {
      const answers = { ...d.answers };
      for (const it of section.items) if (!answers[it.id]?.choice) answers[it.id] = { ...answers[it.id], choice: "ok" };
      return { ...d, answers };
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await submitScopeAction(token, { ...draft, agree });
      if (r.ok) {
        try {
          localStorage.removeItem(storageKey);
        } catch {}
        router.refresh();
        window.scrollTo({ top: 0 });
        return;
      }
      setError(r.error);
      const m = new Set(r.missing ?? []);
      setMissing(m);
      const first = r.missing?.[0];
      if (first) document.getElementById(`item-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return (
    <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
      <p className="text-[15px] leading-relaxed text-[#3d4a66]">
        Em cada item, marque <strong className="text-[#1a7f4b]">De acordo</strong>, <strong className="text-[#9a5b00]">Ressalva</strong> ou{" "}
        <strong className="text-[#b42318]">Não de acordo</strong>. Na ressalva, escreva o ajuste que você precisa. Para desmarcar, clique de novo na opção
        escolhida. As respostas ficam salvas neste navegador até o envio.
      </p>

      {sections.map((sec, si) => (
        <section key={sec.id} className="rounded-2xl border border-[#d9dde6] bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-[17px] font-semibold text-[#000D36]">
              {si + 1}. {sec.title}
            </h2>
            {sec.kind === "checklist" && sec.items.length > 1 ? (
              <button type="button" onClick={() => markAllOk(sec)} className="text-[13px] font-semibold text-[#2f4a8a] underline-offset-2 hover:underline">
                Marcar os restantes como de acordo
              </button>
            ) : null}
          </div>
          <ul className="mt-3 space-y-2.5">
            {sec.items.map((item) => {
              const a = draft.answers[item.id] ?? {};
              const isMissing = missing.has(item.id);
              if (sec.kind === "questions") {
                return (
                  <li key={item.id} id={`item-${item.id}`} className="rounded-xl bg-[#f6f7fa] p-3.5">
                    <label htmlFor={`q-${item.id}`} className="block text-[15px] leading-relaxed text-[#16203a]">
                      {item.text}
                    </label>
                    <textarea
                      id={`q-${item.id}`}
                      rows={2}
                      maxLength={LIMITS.note}
                      value={a.note ?? ""}
                      onChange={(e) => setAnswer(item.id, { note: e.target.value })}
                      className={clsx(field, "mt-2 resize-y")}
                      placeholder="Sua resposta"
                    />
                  </li>
                );
              }
              return (
                <li
                  key={item.id}
                  id={`item-${item.id}`}
                  className={clsx(
                    "rounded-xl border p-3.5 transition-colors",
                    isMissing
                      ? "border-[#d64545] bg-[#fff5f5]"
                      : a.choice === "reservation"
                        ? "border-[#f0c987] bg-[#fffaf0]"
                        : a.choice === "declined"
                          ? "border-[#f3b8b2] bg-[#fff6f5]"
                          : a.choice === "ok"
                            ? "border-[#bfe3cc] bg-[#f5fbf7]"
                            : "border-[#e3e6ee] bg-[#fbfbfc]",
                  )}
                >
                  <p className="text-[15px] leading-relaxed text-[#16203a]">{item.text}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label={item.text}>
                    <Choice active={a.choice === "ok"} tone="ok" onClick={() => toggle(item.id, "ok")}>
                      <Check className="size-4" aria-hidden="true" /> De acordo
                    </Choice>
                    <Choice active={a.choice === "reservation"} tone="reservation" onClick={() => toggle(item.id, "reservation")}>
                      <MessageSquareWarning className="size-4" aria-hidden="true" /> Ressalva
                    </Choice>
                    <Choice active={a.choice === "declined"} tone="declined" onClick={() => toggle(item.id, "declined")}>
                      <X className="size-4" aria-hidden="true" /> Não de acordo
                    </Choice>
                  </div>
                  {a.choice === "reservation" || a.choice === "declined" ? (
                    <textarea
                      rows={2}
                      maxLength={LIMITS.note}
                      autoFocus={!a.note && a.choice === "reservation"}
                      value={a.note ?? ""}
                      onChange={(e) => setAnswer(item.id, { note: e.target.value })}
                      className={clsx(field, "mt-2.5 resize-y", isMissing && !a.note?.trim() && "border-[#d64545]")}
                      placeholder={a.choice === "reservation" ? "Explique o ajuste necessário" : "Motivo (opcional)"}
                      aria-label={`${a.choice === "reservation" ? "Ressalva" : "Motivo"}: ${item.text}`}
                    />
                  ) : null}
                  {isMissing ? (
                    <p className="mt-2 text-[13px] font-medium text-[#b42318]">{a.choice === "reservation" ? "Escreva a ressalva." : "Escolha uma opção."}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="rounded-2xl border border-[#d9dde6] bg-white p-4 sm:p-6">
        <h2 className="text-[17px] font-semibold text-[#000D36]">Validação do escopo</h2>
        {closingText ? <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-[#3d4a66]">{closingText}</p> : null}
        <label className="mt-4 block text-[14px] font-medium text-[#16203a]">
          Observações gerais <span className="font-normal text-[#7a869e]">(opcional)</span>
          <textarea
            rows={3}
            maxLength={LIMITS.longText}
            value={draft.generalNote}
            onChange={(e) => setDraft((d) => ({ ...d, generalNote: e.target.value }))}
            className={clsx(field, "mt-1.5 resize-y font-normal")}
          />
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-[14px] font-medium text-[#16203a]">
            Responsável pela empresa
            <input
              value={draft.signerName}
              maxLength={LIMITS.name}
              autoComplete="name"
              onChange={(e) => setDraft((d) => ({ ...d, signerName: e.target.value }))}
              className={clsx(field, "mt-1.5 font-normal")}
            />
          </label>
          <label className="block text-[14px] font-medium text-[#16203a]">
            Cargo
            <input
              value={draft.signerRole}
              maxLength={LIMITS.name}
              autoComplete="organization-title"
              onChange={(e) => setDraft((d) => ({ ...d, signerRole: e.target.value }))}
              className={clsx(field, "mt-1.5 font-normal")}
            />
          </label>
          <label className="block text-[14px] font-medium text-[#16203a] sm:col-span-2">
            E-mail <span className="font-normal text-[#7a869e]">(opcional)</span>
            <input
              type="email"
              value={draft.signerEmail}
              maxLength={LIMITS.name}
              autoComplete="email"
              onChange={(e) => setDraft((d) => ({ ...d, signerEmail: e.target.value }))}
              className={clsx(field, "mt-1.5 font-normal")}
            />
          </label>
        </div>
        <label className="mt-4 flex items-start gap-3 text-[14.5px] leading-relaxed text-[#16203a]">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 size-4 shrink-0 accent-[#000D36]" />
          Revisei os itens e confirmo as atividades marcadas como de acordo. Os itens com ressalva serão alinhados antes da formalização do contrato.
        </label>
      </section>

      <div className="sticky bottom-0 -mx-4 border-t border-[#d9dde6] bg-[#f5f4f1]/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        {error ? (
          <p role="alert" className="mb-2 text-[14px] font-medium text-[#b42318]">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-[#3d4a66]">
            <strong className="text-[#000D36]">{answered}</strong> de {checklistIds.length} itens respondidos
          </p>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full bg-[#000D36] px-6 py-3 text-[15px] font-semibold text-white transition hover:bg-[#0b1d55] disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Confirmar escopo
          </button>
        </div>
      </div>
    </form>
  );
}

const CHOICE_ACTIVE: Record<ScopeChoice, string> = {
  ok: "border-[#1a7f4b] bg-[#1a7f4b] text-white",
  reservation: "border-[#b86e00] bg-[#b86e00] text-white",
  declined: "border-[#b42318] bg-[#b42318] text-white",
};

/** Botão de opção que liga e desliga: clicar de novo na opção marcada desmarca. */
function Choice({ active, tone, onClick, children }: { active: boolean; tone: ScopeChoice; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={active ? "Clique de novo para desmarcar" : undefined}
      onClick={onClick}
      className={clsx(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-[14px] font-semibold transition",
        active ? CHOICE_ACTIVE[tone] : "border-[#cfd5e1] bg-white text-[#3d4a66] hover:border-[#000D36]",
      )}
    >
      {children}
    </button>
  );
}
