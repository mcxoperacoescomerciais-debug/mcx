"use client";
/**
 * Tela do Assistente: conversas à esquerda, mensagens com resposta em
 * streaming, anexos (foto/PDF), "Prompts MCX" e "Transformar em demanda".
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Archive, ArchiveRestore, ClipboardPlus, Copy, Paperclip, Pencil, Plus, Send, X } from "lucide-react";
import { archiveConversationAction, renameConversationAction } from "@/app/actions";
import { attachmentError, MAX_ATTACHMENTS } from "@/lib/assistant";

type Msg = { id: string; role: "user" | "assistant"; content: string; attachments: string[]; error: string | null };
type Conversation = { id: string; title: string; updatedAt: string };

export function Chat({
  access,
  conversations,
  archived,
  current,
  prompts,
  suggestions,
}: {
  access: { canUse: boolean; reason: string | null; warn: boolean };
  conversations: Conversation[];
  archived: boolean;
  current: { id: string; title: string; archived: boolean; messages: Msg[] } | null;
  prompts: { id: string; title: string; text: string }[];
  suggestions: { title: string; examples: string[] }[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(current?.messages ?? []);
  const [conversationId, setConversationId] = useState<string | null>(current?.id ?? null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function fill(value: string) {
    setText(value);
    box.current?.focus();
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, MAX_ATTACHMENTS);
    const problem = attachmentError(next.map((f) => ({ name: f.name, type: f.type, size: f.size })));
    setError(problem);
    if (!problem) setFiles(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function send() {
    if (busy || (!text.trim() && !files.length)) return;
    setError(null);
    setBusy(true);
    const form = new FormData();
    if (conversationId) form.set("conversationId", conversationId);
    form.set("text", text);
    for (const f of files) form.append("files", f);
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: text.trim(), attachments: files.map((f) => f.name), error: null };
    const answerId = `a-${Date.now()}`;
    setMessages((m) => [...m, userMsg, { id: answerId, role: "assistant", content: "", attachments: [], error: null }]);
    const sentText = text;
    const sentFiles = files;
    setText("");
    setFiles([]);
    const patchAnswer = (fn: (m: Msg) => Msg) => setMessages((list) => list.map((m) => (m.id === answerId ? fn(m) : m)));
    let newId: string | null = null;
    try {
      const res = await fetch("/api/assistente", { method: "POST", body: form });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({ error: "Não consegui enviar. Tente de novo." }));
        throw new Error(body.error ?? "Não consegui enviar. Tente de novo.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { c?: string; t?: string; done?: boolean; error?: string };
          if (ev.c) {
            newId = ev.c;
            setConversationId(ev.c);
          }
          if (ev.t) patchAnswer((m) => ({ ...m, content: m.content + ev.t }));
          if (ev.error) {
            patchAnswer((m) => ({ ...m, error: ev.error! }));
            if (!newId) {
              // Nada foi gravado (ex.: limite atingido): devolve o texto para a caixa.
              setMessages((list) => list.filter((m) => m.id !== answerId && m.id !== userMsg.id));
              setText(sentText);
              setFiles(sentFiles);
              setError(ev.error);
            }
          }
        }
      }
    } catch (err) {
      setMessages((list) => list.filter((m) => m.id !== answerId && m.id !== userMsg.id));
      setText(sentText);
      setFiles(sentFiles);
      setError(err instanceof Error ? err.message : "Não consegui enviar. Tente de novo.");
    } finally {
      setBusy(false);
      if (newId && newId !== current?.id) router.replace(`/assistente?c=${newId}`, { scroll: false });
      else router.refresh();
    }
  }

  function toDemand(content: string) {
    const firstLine = content.split("\n").find((l) => l.trim())?.replace(/^[#*\-\s]+/, "").trim() ?? "";
    window.dispatchEvent(new CustomEvent("mcx:nova-demanda", { detail: { title: firstLine.slice(0, 120), description: content } }));
  }

  async function copy(id: string, content: string) {
    await navigator.clipboard?.writeText(content).catch(() => null);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <aside className="card h-fit p-3">
        <Link href="/assistente" className="btn-primary w-full">
          <Plus aria-hidden className="size-4" /> Nova conversa
        </Link>
        <ul className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/assistente?c=${c.id}${archived ? "&arquivadas=1" : ""}`}
                className={clsx("block truncate rounded-lg px-2 py-2 text-sm hover:bg-subtle", c.id === conversationId ? "bg-subtle font-semibold text-brand-900" : "text-ink-2")}
              >
                {c.title}
              </Link>
            </li>
          ))}
          {!conversations.length && <li className="px-2 py-2 text-sm text-muted">{archived ? "Nenhuma conversa arquivada." : "Nenhuma conversa ainda."}</li>}
        </ul>
        <Link href={archived ? "/assistente" : "/assistente?arquivadas=1"} className="mt-2 block px-2 text-xs text-muted underline-offset-2 hover:underline">
          {archived ? "Ver conversas ativas" : "Ver arquivadas"}
        </Link>
      </aside>

      <section className="card flex min-h-[60vh] min-w-0 flex-col">
        {current && <ConversationBar id={current.id} title={current.title} archived={current.archived} />}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {!messages.length && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-ink-2">Prompts MCX</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {prompts.map((p) => (
                    <button key={p.id} type="button" className="btn-ghost min-h-9 text-xs" onClick={() => fill(p.text)} disabled={!access.canUse}>
                      {p.title}
                    </button>
                  ))}
                </div>
              </div>
              {suggestions.map((s) => (
                <div key={s.title}>
                  <p className="text-sm font-semibold text-ink-2">{s.title}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.examples.map((e) => (
                      <button key={e} type="button" className="rounded-full border border-line px-3 py-1.5 text-left text-xs text-ink-2 hover:bg-subtle disabled:opacity-50" onClick={() => fill(e)} disabled={!access.canUse}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={clsx("max-w-[92%] rounded-xl px-3 py-2 text-sm", m.role === "user" ? "ml-auto bg-brand-50 text-ink" : "bg-subtle text-ink")}>
              {m.attachments.length > 0 && <p className="mb-1 text-xs text-muted">Anexo: {m.attachments.join(", ")}</p>}
              {m.content ? <div className="whitespace-pre-wrap break-words">{m.content}</div> : m.role === "assistant" && !m.error ? <p className="text-muted">Pensando…</p> : null}
              {m.error && <p className="mt-1 text-xs font-semibold text-bad">{m.error}</p>}
              {m.role === "assistant" && m.content && !busy && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-800 hover:underline" onClick={() => toDemand(m.content)}>
                    <ClipboardPlus aria-hidden className="size-3.5" /> Transformar em demanda
                  </button>
                  <button type="button" className="inline-flex items-center gap-1 text-xs text-muted hover:underline" onClick={() => copy(m.id, m.content)}>
                    <Copy aria-hidden className="size-3.5" /> {copied === m.id ? "Copiado" : "Copiar"}
                  </button>
                </div>
              )}
            </div>
          ))}
          <div ref={bottom} />
        </div>

        <div className="border-t border-line p-3">
          {!access.canUse && <p role="alert" className="mb-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">{access.reason}</p>}
          {access.canUse && access.warn && <p className="mb-2 rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">O uso do mês passou de 80% do limite.</p>}
          {error && <p role="alert" className="mb-2 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-1 text-xs">
                  {f.name}
                  <button type="button" aria-label={`Tirar ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    <X aria-hidden className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            <button type="button" className="btn-ghost min-h-11 px-3" aria-label="Anexar foto ou PDF" onClick={() => fileInput.current?.click()} disabled={!access.canUse || busy || files.length >= MAX_ATTACHMENTS}>
              <Paperclip aria-hidden className="size-4" />
            </button>
            <label htmlFor="as-text" className="sr-only">Mensagem</label>
            <textarea
              id="as-text"
              ref={box}
              className="field min-h-11 flex-1 resize-y"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={access.canUse ? "Escreva sua mensagem (Enter envia, Shift+Enter pula linha)" : "Assistente indisponível"}
              disabled={!access.canUse}
              maxLength={20000}
            />
            <button type="submit" className="btn-primary min-h-11 px-4" disabled={!access.canUse || busy || (!text.trim() && !files.length)}>
              <Send aria-hidden className="size-4" /> <span className="max-sm:sr-only">{busy ? "Respondendo…" : "Enviar"}</span>
            </button>
          </form>
          <p className="mt-2 text-xs text-muted">Evite colar CPF, RG ou dados pessoais de promotores sem necessidade. O Assistente não acessa os dados do MCX e pode errar: confira antes de enviar ao cliente.</p>
        </div>
      </section>
    </div>
  );
}

function ConversationBar({ id, title, archived }: { id: string; title: string; archived: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [error, setError] = useState<string | null>(null);
  async function rename() {
    const r = await renameConversationAction(id, value);
    if (!r.ok) return setError(r.error);
    setEditing(false);
    router.refresh();
  }
  async function toggleArchive() {
    const r = await archiveConversationAction(id, !archived);
    if (!r.ok) return setError(r.error);
    router.push(archived ? `/assistente?c=${id}` : "/assistente");
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
      {editing ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void rename();
          }}
        >
          <label htmlFor="as-title" className="sr-only">Nome da conversa</label>
          <input id="as-title" className="field min-h-9 flex-1" value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} autoFocus />
          <button type="submit" className="btn-primary min-h-9">Salvar</button>
        </form>
      ) : (
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-900">{title}</h2>
      )}
      {!editing && (
        <button type="button" className="btn-ghost min-h-9 px-3 text-xs" onClick={() => setEditing(true)}>
          <Pencil aria-hidden className="size-3.5" /> Renomear
        </button>
      )}
      <button type="button" className="btn-ghost min-h-9 px-3 text-xs" onClick={() => void toggleArchive()}>
        {archived ? <ArchiveRestore aria-hidden className="size-3.5" /> : <Archive aria-hidden className="size-3.5" />} {archived ? "Restaurar" : "Arquivar"}
      </button>
      {error && <p role="alert" className="w-full text-xs text-bad">{error}</p>}
    </div>
  );
}
