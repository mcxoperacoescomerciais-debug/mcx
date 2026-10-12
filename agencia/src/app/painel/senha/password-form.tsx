"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui";

export function PasswordForm() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (fd.get("next") !== fd.get("confirm")) return setMsg({ ok: false, text: "A confirmação não confere." });
        setBusy(true);
        const res = await fetch("/api/me/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: fd.get("current"), next: fd.get("next") }) }).catch(() => null);
        setBusy(false);
        const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
        if (!res?.ok) return setMsg({ ok: false, text: body?.error ?? "Sem conexão." });
        setMsg({ ok: true, text: "Senha alterada. Entre novamente." });
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- /sair é route handler
        setTimeout(() => (window.location.href = "/sair"), 1000);
      }}
    >
      <input name="current" type="password" required placeholder="Senha atual" autoComplete="current-password" className={inputClass} />
      <input name="next" type="password" required placeholder="Nova senha" autoComplete="new-password" className={inputClass} />
      <input name="confirm" type="password" required placeholder="Confirme a nova senha" autoComplete="new-password" className={inputClass} />
      <button className={buttonClass("primary")} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null} Salvar nova senha
      </button>
      {msg ? <p className={`text-[13px] font-medium ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p> : null}
    </form>
  );
}
