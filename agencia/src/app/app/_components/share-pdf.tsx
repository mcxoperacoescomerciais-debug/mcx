"use client";

/**
 * "Enviar PDF no WhatsApp" (modo SUINCO). O PDF é preparado assim que o
 * atendimento está no servidor com todas as fotos: o celular só abre a janela
 * de compartilhar logo após o toque, então o toque não pode esperar o download
 * (era isso que fazia a 1ª tentativa falhar).
 */
import { useEffect, useState } from "react";
import { Download, FileText, Share2 } from "lucide-react";
import { Button } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { attendanceDisplayStatus, type LocalAttendance } from "../_lib/local-store";
import { useCatalog, useLocal } from "../_lib/hooks";

export function SharePdf({ attendance, storeId, visitDate }: { attendance: LocalAttendance; storeId: string; visitDate: string }) {
  const { bootstrap } = useLocal();
  const cat = useCatalog();
  const store = cat.storeById.get(storeId);
  const brand = cat.brandById.get(attendance.brandId);
  const synced = attendanceDisplayStatus(attendance) === "completed" && attendance.photos.every((p) => p.uploaded);
  const [file, setFile] = useState<File | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const url = `/api/promoter/attendance/${attendance.id}/pdf`;

  const text = [
    `Relatório de atendimento – ${bootstrap?.agency.name ?? ""}`,
    `Marca: ${brand?.name ?? ""}`,
    `Promotor: ${bootstrap?.user.name ?? ""}`,
    `Loja: ${store?.name ?? ""}`,
    `Cidade: ${store?.city ?? ""}`,
    `Data: ${fmtDate(visitDate)}`,
  ].join("\n");

  useEffect(() => {
    if (!synced) return;
    let cancelled = false;
    void (async () => {
      setFailed(false);
      for (let i = 0; i < 4 && !cancelled; i++) {
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "atendimento.pdf";
          const f = new File([await res.blob()], name, { type: "application/pdf" });
          if (!cancelled) setFile(f);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        }
      }
      if (!cancelled) setFailed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [synced, url, attempt]);

  async function share() {
    if (!file) return;
    setMsg(null);
    // Mensagem também na área de transferência (sem esperar: o compartilhar sai no mesmo toque).
    navigator.clipboard?.writeText(text).then(
      () => undefined,
      () => undefined,
    );
    try {
      if (navigator.canShare?.({ files: [file], text })) await navigator.share({ files: [file], text, title: "Relatório de atendimento" });
      else if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "Relatório de atendimento" });
      else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
      }
    } catch (e) {
      const n = (e as Error)?.name;
      if (n === "NotAllowedError") setMsg("O celular bloqueou a janela de compartilhar. Toque de novo.");
      else if (n !== "AbortError") setMsg("Não foi possível compartilhar agora. Tente de novo.");
    }
  }

  if (!synced) {
    return <p className="text-[13px] text-muted text-center">O PDF fica disponível quando o atendimento e as fotos chegarem ao servidor.</p>;
  }
  return (
    <div className="space-y-2">
      <Button size="xl" variant="success" className="w-full" disabled={!file && !failed} onClick={() => (file ? void share() : setAttempt((n) => n + 1))}>
        <Share2 className="size-5" /> {file ? "ENVIAR PDF NO WHATSAPP" : failed ? "TENTAR PREPARAR O PDF DE NOVO" : "PREPARANDO O PDF…"}
      </Button>
      {msg ? <p className="text-[13px] text-bad text-center">{msg}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <a href={url} className="h-11 rounded-xl border border-line-strong text-[14px] font-semibold inline-flex items-center justify-center gap-2">
          <Download className="size-4" /> Baixar PDF
        </a>
        <a href={url} target="_blank" rel="noreferrer" className="h-11 rounded-xl border border-line-strong text-[14px] font-semibold inline-flex items-center justify-center gap-2">
          <FileText className="size-4" /> Ver relatório
        </a>
      </div>
      <div className="rounded-xl bg-canvas px-3 py-2.5 text-[12.5px] text-ink-2">
        <p className="font-semibold mb-0.5">Mensagem que vai junto do PDF:</p>
        <p className="whitespace-pre-line">{text}</p>
      </div>
    </div>
  );
}
