"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClass } from "@/components/ui";

/** Copia o link do escopo para colar no WhatsApp ou no e-mail do cliente. */
export function CopyLink({ url, size = "sm" }: { url: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary", size)}
      onClick={() =>
        navigator.clipboard?.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
      }
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "Copiado" : "Copiar link"}
    </button>
  );
}
