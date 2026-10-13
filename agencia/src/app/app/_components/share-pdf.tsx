"use client";

/**
 * "Enviar PDF no WhatsApp" (modo SUINCO). Com sinal e o atendimento já no
 * servidor, usa o PDF oficial; sem sinal (ou antes de sincronizar), gera o PDF
 * no próprio celular com o que está gravado nele — o promotor nunca fica sem o
 * relatório. O arquivo é preparado ANTES do toque: o celular só abre a janela
 * de compartilhar logo após o toque, então o toque não pode esperar.
 */
import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Images, Share2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { attendanceDisplayStatus, type LocalAttendance } from "../_lib/local-store";
import { useCatalog, useLocal, useObjectUrl } from "../_lib/hooks";

export function SharePdf({ attendance, storeId, visitDate }: { attendance: LocalAttendance; storeId: string; visitDate: string }) {
  const { bootstrap, sync } = useLocal();
  const cat = useCatalog();
  const store = cat.storeById.get(storeId);
  const brand = cat.brandById.get(attendance.brandId);
  const status = attendanceDisplayStatus(attendance);
  const synced = status === "completed" && attendance.photos.every((p) => p.uploaded);
  const useServer = synced && sync.online;
  const [serverFile, setServerFile] = useState<File | null>(null);
  const [serverFailed, setServerFailed] = useState(false);
  // Guardado junto do atendimento de origem: PDF de uma versão anterior não é usado.
  const [localPdf, setLocalPdf] = useState<{ source: LocalAttendance; file: File | null } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const url = `/api/promoter/attendance/${attendance.id}/pdf`;
  const products = useMemo(() => new Map(cat.products.map((p) => [p.id, p])), [cat.products]);

  const text = [
    `Relatório de atendimento – ${bootstrap?.agency.name ?? ""}`,
    `Marca: ${brand?.name ?? ""}`,
    `Promotor: ${bootstrap?.user.name ?? ""}`,
    `Loja: ${store?.name ?? ""}`,
    `Cidade: ${store?.city ?? ""}`,
    `Data: ${fmtDate(visitDate)}`,
  ].join("\n");

  // PDF oficial (servidor), quando há sinal e tudo já foi enviado.
  useEffect(() => {
    if (!useServer) return;
    let cancelled = false;
    void (async () => {
      setServerFailed(false);
      for (let i = 0; i < 3 && !cancelled; i++) {
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "atendimento.pdf";
          const f = new File([await res.blob()], name, { type: "application/pdf" });
          if (!cancelled) setServerFile(f);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        }
      }
      if (!cancelled) setServerFailed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [useServer, url]);

  // PDF do aparelho: sem sinal, antes de sincronizar ou se o servidor falhar.
  const needLocal = !useServer || serverFailed;
  useEffect(() => {
    if (!needLocal || !bootstrap) return;
    let cancelled = false;
    void (async () => {
      const { buildLocalPdf } = await import("../_lib/local-pdf");
      const f = await buildLocalPdf({
        agency: bootstrap.agency.name,
        promoter: bootstrap.user.name,
        brand: brand?.name ?? "Marca",
        store: store?.name ?? "Loja",
        city: store?.city ?? "",
        visitDate,
        status,
        attendance,
        products,
      }).catch(() => null);
      if (!cancelled) setLocalPdf({ source: attendance, file: f });
    })();
    return () => {
      cancelled = true;
    };
  }, [needLocal, bootstrap, attendance, brand, store, visitDate, status, products]);

  const localFile = localPdf?.source === attendance ? localPdf.file : null;
  const file = useServer && serverFile ? serverFile : needLocal ? localFile : null;

  // Fotos do depois (com faixa de identificação) vão junto com o PDF.
  const afterKey = attendance.photos
    .filter((ph) => ph.kind === "after")
    .map((ph) => `${ph.id}:${ph.uploaded}`)
    .join(",");
  const [photos, setPhotos] = useState<{ key: string; files: File[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { afterPhotoFiles } = await import("../_lib/photo-stamp");
      const files = await afterPhotoFiles(attendance.photos, {
        brand: brand?.name ?? "",
        store: store?.name ?? "",
        address: [store?.address, store?.city].filter(Boolean).join(" · "),
      }).catch(() => []);
      if (!cancelled) setPhotos({ key: afterKey, files });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refaz só quando as fotos do depois mudam
  }, [afterKey, brand?.name, store?.name]);
  const photoFiles = photos?.key === afterKey ? photos.files : null;
  const ready = Boolean(file) && photoFiles !== null;
  const isLocal = file !== null && file === localFile;
  const fileUrl = useObjectUrl(isLocal ? file : null);

  async function share(onlyPhotos = false) {
    if (!file && !onlyPhotos) return;
    setMsg(null);
    // Mensagem também na área de transferência (sem esperar: o compartilhar sai no mesmo toque).
    navigator.clipboard?.writeText(text).then(
      () => undefined,
      () => undefined,
    );
    const all = onlyPhotos ? (photoFiles ?? []) : [file!, ...(photoFiles ?? [])];
    try {
      if (all.length && navigator.canShare?.({ files: all, text })) await navigator.share({ files: all, text, title: "Relatório de atendimento" });
      else if (all.length && navigator.canShare?.({ files: all })) await navigator.share({ files: all, title: "Relatório de atendimento" });
      else if (!onlyPhotos && navigator.canShare?.({ files: [file!] })) {
        // Celular não aceita vários arquivos de uma vez: vai o PDF; as fotos no botão abaixo.
        await navigator.share({ files: [file!], text, title: "Relatório de atendimento" });
        if (photoFiles?.length) setMsg("Este celular envia um arquivo por vez. Toque em “Enviar fotos do depois”.");
      } else if (file) {
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

  const href = isLocal ? fileUrl : url;
  return (
    <div className="space-y-2">
      <Button size="xl" variant="success" className="w-full" disabled={!ready} onClick={() => void share()}>
        <Share2 className="size-5" /> {ready ? "ENVIAR PDF + FOTOS DO DEPOIS" : "PREPARANDO O RELATÓRIO…"}
      </Button>
      {ready && photoFiles?.length ? (
        <p className="text-[12.5px] text-muted text-center">
          PDF + {photoFiles.length} foto(s) do depois. No WhatsApp, escolha o grupo da loja.
        </p>
      ) : null}
      {isLocal ? (
        <p className="text-[12.5px] text-muted text-center inline-flex items-center justify-center gap-1.5 w-full">
          <WifiOff className="size-3.5" />
          {sync.online ? "PDF gerado no celular (o oficial fica pronto quando tudo for enviado)." : "Sem sinal: PDF gerado no celular com o que está gravado nele."}
        </p>
      ) : null}
      {msg ? <p className="text-[13px] text-bad text-center">{msg}</p> : null}
      {photoFiles?.length ? (
        <button type="button" onClick={() => void share(true)} className="w-full h-11 rounded-xl border border-line-strong text-[14px] font-semibold inline-flex items-center justify-center gap-2">
          <Images className="size-4" /> Enviar fotos do depois
        </button>
      ) : null}
      {href && file ? (
        <div className="grid grid-cols-2 gap-2">
          <a href={href} download={file.name} className="h-11 rounded-xl border border-line-strong text-[14px] font-semibold inline-flex items-center justify-center gap-2">
            <Download className="size-4" /> Baixar PDF
          </a>
          <a href={href} target="_blank" rel="noreferrer" className="h-11 rounded-xl border border-line-strong text-[14px] font-semibold inline-flex items-center justify-center gap-2">
            <FileText className="size-4" /> Ver relatório
          </a>
        </div>
      ) : null}
      <div className="rounded-xl bg-canvas px-3 py-2.5 text-[12.5px] text-ink-2">
        <p className="font-semibold mb-0.5">Mensagem que vai junto do PDF:</p>
        <p className="whitespace-pre-line">{text}</p>
      </div>
    </div>
  );
}
