"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCalendarConfigAction } from "@/app/actions";

export function CalendarSettings({ initial }: { initial: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="mt-2 space-y-2">
      <label className="label" htmlFor="gc-lines">Uma agenda por linha, no formato “Nome: ID da agenda”</label>
      <textarea
        id="gc-lines"
        className="field min-h-28 font-mono text-sm"
        placeholder={"Maria: maria@gmail.com\nComercial: abc123@group.calendar.google.com"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="text-xs text-muted">
        O ID fica no Google Agenda › Configurações da agenda › Integrar agenda › “ID da agenda” (na agenda principal é o próprio e-mail). Também aceito o link de incorporação. Até 10 agendas.
      </p>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`}>{msg.text}</p>}
      <button
        type="button"
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await saveCalendarConfigAction(text);
            setMsg(r.ok ? { ok: true, text: r.message ?? "Salvo." } : { ok: false, text: r.error });
            if (r.ok) router.refresh();
          })
        }
      >
        Salvar agendas
      </button>
    </div>
  );
}
