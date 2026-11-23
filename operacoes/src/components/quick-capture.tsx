"use client";
/**
 * Captura rápida: botão fixo "+ Demanda". O essencial (título, contratante,
 * responsável, prazo) cabe na primeira tela; o resto fica em "Mais campos".
 * A categoria vem sugerida pelo histórico do contratante.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createDemandAction } from "@/app/actions";
import { ORIGINS, ORIGIN_LABEL, PRIORITIES, PRIORITY_LABEL, type Origin, type Priority } from "@/lib/domain";
import type { FormOptions } from "@/server/demands";
import { DuePicker } from "./due-picker";

export function QuickCapture({ options, userId, today }: { options: FormOptions; userId: string; today: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [assigneeId, setAssigneeId] = useState(userId);
  const [dueDate, setDueDate] = useState<string | null>(today);
  const [priority, setPriority] = useState<Priority>("medium");
  const [more, setMore] = useState(false);
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [origin, setOrigin] = useState<Origin>("manual");
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Outras telas (ex.: Assistente) abrem a captura já preenchida.
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const d = (e as CustomEvent<{ title?: string; description?: string }>).detail ?? {};
      setTitle((d.title ?? "").slice(0, 200));
      setDescription((d.description ?? "").slice(0, 4000));
      setMore(Boolean(d.description));
      setError(null);
      setDuplicate(false);
      dialog.current?.showModal();
      titleRef.current?.focus();
    };
    window.addEventListener("mcx:nova-demanda", onPrefill);
    return () => window.removeEventListener("mcx:nova-demanda", onPrefill);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function open() {
    setError(null);
    setDuplicate(false);
    dialog.current?.showModal();
    titleRef.current?.focus();
  }

  function pickClient(id: string) {
    setClientId(id);
    setBrand("");
    const suggested = options.suggestions[id];
    if (suggested && options.categories.some((c) => c.id === suggested)) setCategoryId(suggested);
  }

  function pickDue(v: string | null) {
    setDueDate(v);
    if (v === null) setPriority("low"); // "Sem prazo" só com prioridade Baixa
  }

  function submit(confirmDuplicate: boolean) {
    setError(null);
    start(async () => {
      const result = await createDemandAction({ title, clientId, categoryId, typeId: types.some((ty) => ty.id === typeId) ? typeId : null, assigneeId, dueDate, priority, description, brand, origin }, confirmDuplicate);
      if (!result.ok) {
        setError(result.error);
        setDuplicate("duplicate" in result && !!result.duplicate);
        return;
      }
      setToast(result.message ?? "Demanda criada.");
      setTitle("");
      setDescription("");
      setBrand("");
      setDuplicate(false);
      setDueDate(today);
      setPriority("medium");
      dialog.current?.close();
      router.refresh();
    });
  }

  const brands = options.brands.filter((b) => b.clientId === clientId);
  const types = options.types.filter((ty) => ty.categoryId === categoryId);

  return (
    <>
      <button type="button" onClick={open} className="btn-primary fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-30 min-h-14 rounded-full px-5 text-base shadow-[var(--shadow-pop)]">
        <Plus aria-hidden className="size-5" /> Demanda
      </button>
      {toast && (
        <p role="status" className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-pop)]">
          {toast}
        </p>
      )}
      <dialog ref={dialog} className="m-auto w-full max-w-lg rounded-2xl p-0 shadow-[var(--shadow-pop)] backdrop:bg-brand-950/50 max-sm:mb-0 max-sm:max-w-none max-sm:rounded-b-none">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
          className="space-y-4 p-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-brand-900">Nova demanda</h2>
            <button type="button" aria-label="Fechar" className="rounded-lg p-2 text-muted hover:bg-subtle" onClick={() => dialog.current?.close()}>
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <div>
            <label className="label" htmlFor="qc-title">O que precisa ser feito?</label>
            <input id="qc-title" ref={titleRef} className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Digitar pedido Fini — Sup. Castro" required minLength={3} maxLength={200} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="qc-client">Contratante</label>
              <select id="qc-client" className="field" value={clientId} onChange={(e) => pickClient(e.target.value)} required>
                <option value="">Escolha…</option>
                {options.clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="qc-assignee">Responsável</label>
              <select id="qc-assignee" className="field" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} required>
                {options.people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <span className="label">Prazo</span>
            <DuePicker value={dueDate} onChange={pickDue} today={today} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="qc-category">Categoria{clientId && options.suggestions[clientId] === categoryId ? " (sugerida)" : ""}</label>
              <select id="qc-category" className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
                <option value="">Escolha…</option>
                {options.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="qc-priority">Prioridade</label>
              <select id="qc-priority" className="field" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p} disabled={dueDate === null && p !== "low"}>{PRIORITY_LABEL[p]}</option>
                ))}
              </select>
            </div>
          </div>
          {more ? (
            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="qc-type">Tipo</label>
                <select id="qc-type" className="field" value={types.some((ty) => ty.id === typeId) ? typeId : ""} onChange={(e) => setTypeId(e.target.value)}>
                  <option value="">Sem tipo</option>
                  {types.map((ty) => (
                    <option key={ty.id} value={ty.id}>{ty.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="qc-brand">Marca</label>
                  <input id="qc-brand" className="field" list="qc-brands" value={brand} onChange={(e) => setBrand(e.target.value)} />
                  <datalist id="qc-brands">
                    {brands.map((b) => (
                      <option key={b.name} value={b.name} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="label" htmlFor="qc-origin">Origem</label>
                  <select id="qc-origin" className="field" value={origin} onChange={(e) => setOrigin(e.target.value as Origin)}>
                    {ORIGINS.filter((o) => o !== "routine" && o !== "system").map((o) => (
                      <option key={o} value={o}>{ORIGIN_LABEL[o]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="qc-desc">Descrição</label>
                <textarea id="qc-desc" className="field min-h-20 py-2" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>
          ) : (
            <button type="button" className="text-sm font-semibold text-brand-600 underline-offset-2 hover:underline" onClick={() => setMore(true)}>
              Mais campos (tipo, marca, origem, descrição)
            </button>
          )}
          {error && <p role="alert" className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {duplicate && (
              <button type="button" className="btn-ghost" disabled={pending} onClick={() => submit(true)}>
                Criar mesmo assim
              </button>
            )}
            <button className="btn-primary" disabled={pending}>{pending ? "Salvando…" : "Criar demanda"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
