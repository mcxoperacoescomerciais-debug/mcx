"use client";

/**
 * "Enviar PDF + fotos no WhatsApp" (modo SUINCO), num toque só: as fotos do antes
 * e do depois (cada uma com a faixa ANTES/DEPOIS) vão como FOTO e o relatório em
 * PDF vai como link na mensagem (/r/<código>, abre sem login). Anexar o PDF faria
 * o WhatsApp mandar as fotos como arquivo; por isso o PDF só vai anexado quando o
 * atendimento não tem link (finalizado antes da atualização). Com sinal e o atendimento já no
 * servidor, usa o PDF oficial; sem sinal (ou antes de sincronizar), gera o PDF
 * no próprio celular com o que está gravado nele — o promotor nunca fica sem o
 * relatório. O arquivo é preparado ANTES do toque: o celular só abre a janela
 * de compartilhar logo após o toque, então o toque não pode esperar.
 */
import { useEffect, useMemo, useState } from "react";
import { Download, Share2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { attendanceDisplayStatus, type LocalAttendance } from "../_lib/local-store";
import { useCatalog, useLocal, useObjectUrl } from "../_lib/hooks";
import { GROUP_MAX_FILES, groupPhotos, groupPhotosNote } from "../_lib/group-photos";

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

  // Fotos do antes e do depois (com faixa de identificação), enviadas à parte do PDF.
  // Android aceita no máximo 10 arquivos por envio: vão as 10 primeiras tiradas (9 se o PDF
  // for anexado); o excedente fica só no relatório e a mensagem avisa.
  const groupMax = attendance.reportLinkId ? GROUP_MAX_FILES : GROUP_MAX_FILES - 1;
  const group = groupPhotos(attendance.photos, groupMax);
  const photoKey = group.sent.map((ph) => `${ph.id}:${ph.uploaded}`).join(",");
  const [photos, setPhotos] = useState<{ key: string; before: File[]; after: File[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { beforeAfterPhotoFiles } = await import("../_lib/photo-stamp");
      const files = await beforeAfterPhotoFiles(group.sent, {
        store: store?.name ?? "",
        city: [store?.city, store?.state].filter(Boolean).join(" - "),
        promoter: bootstrap?.user.name ?? "",
      }).catch(() => ({ before: [], after: [] }));
      if (!cancelled) setPhotos({ key: photoKey, ...files });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refaz só quando as fotos mudam
  }, [photoKey, store?.name, bootstrap?.user.name]);
  const loaded = photos?.key === photoKey ? photos : null;
  const photoFiles = loaded ? [...loaded.before, ...loaded.after] : null;
  const isLocal = file !== null && file === localFile;
  const fileUrl = useObjectUrl(isLocal ? file : null);
  // Link do relatório completo (criado ao finalizar): o PDF vai como link na mensagem e as
  // fotos vão como FOTO. Sem o link (atendimento antigo), o PDF vai como arquivo junto.
  const reportUrl = attendance.reportLinkId && typeof window !== "undefined" ? `${window.location.origin}/r/${attendance.reportLinkId}` : null;
  const note = photoFiles ? groupPhotosNote(photoFiles.length, photoFiles.length + group.left) : null;
  const message0 = reportUrl ? `${text}\n\n📄 Relatório completo (PDF): ${reportUrl}` : text;
  const message = note ? `${message0}\n\n${note}` : message0;
  const ready = photoFiles !== null && (Boolean(reportUrl) || Boolean(file));

  async function share() {
    setMsg(null);
    // Mensagem também na área de transferência (alguns WhatsApp ignoram o texto quando vão fotos).
    navigator.clipboard?.writeText(message).then(
      () => undefined,
      () => undefined,
    );
    const imgs = photoFiles ?? [];
    const all = reportUrl ? imgs : file ? [file, ...imgs] : imgs;
    try {
      if (all.length && navigator.canShare?.({ files: all, text: message })) await navigator.share({ files: all, text: message, title: "Relatório de atendimento" });
      else if (all.length && navigator.canShare?.({ files: all })) {
        await navigator.share({ files: all, title: "Relatório de atendimento" });
        setMsg("O texto foi copiado: cole na conversa do WhatsApp.");
      } else if (!all.length) window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
      else if (file) {
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
  const count = photoFiles?.length ?? 0;
  return (
    <div className="space-y-2">
      <Button size="xl" variant="success" className="w-full" disabled={!ready} onClick={() => void share()}>
        <Share2 className="size-5" /> {ready ? "ENVIAR PDF + FOTOS" : "PREPARANDO O RELATÓRIO…"}
      </Button>
      {ready ? (
        <p className="text-[12.5px] text-muted text-center">
          {count ? `${count} foto(s) — cada uma marcada ANTES ou DEPOIS — ` : ""}e o relatório em PDF. No WhatsApp, escolha o grupo da loja.
        </p>
      ) : null}
      {ready && group.left > 0 ? (
        <p className="text-[12.5px] text-warn font-semibold text-center">
          O WhatsApp aceita até {groupMax} fotos por envio: vão as {count} primeiras. As outras {group.left} ficam só no relatório (a mensagem avisa o grupo).
        </p>
      ) : null}
      {msg ? <p className="text-[13px] text-bad text-center">{msg}</p> : null}
      {href && file ? (
        <a href={href} download={file.name} className="w-full h-11 rounded-xl border border-line-strong text-[14px] font-semibold inline-flex items-center justify-center gap-2">
          <Download className="size-4" /> Baixar PDF
        </a>
      ) : null}
      {isLocal && !sync.online ? (
        <p className="text-[12px] text-muted text-center inline-flex items-center justify-center gap-1.5 w-full">
          <WifiOff className="size-3.5" /> Sem sinal: o link do relatório abre quando o celular enviar o atendimento.
        </p>
      ) : null}
    </div>
  );
}
