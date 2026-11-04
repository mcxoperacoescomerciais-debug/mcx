"use client";

/**
 * Consulta do painel sem internet: o service worker guarda a última versão de
 * cada tela aberta (e a mostra quando falta sinal). Aqui: registra o service
 * worker, pede para guardar a tela atual a cada navegação, limpa as cópias ao
 * sair ou trocar de agência e mostra o aviso de "sem internet".
 */
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { WifiOff } from "lucide-react";

const AGENCY_KEY = "mcx-painel-agencia";

/** Apaga as telas guardadas neste aparelho (ao sair da conta ou trocar de agência). */
export async function clearPanelCache() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("painel-")).map((k) => caches.delete(k)));
  } catch {
    // Navegador sem Cache Storage: nada guardado.
  }
}

export function PanelOffline({ agencyId }: { agencyId: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [online, setOnline] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    // Outra agência neste aparelho (equipe MCX): as cópias da anterior não valem.
    try {
      if (localStorage.getItem(AGENCY_KEY) !== agencyId) {
        void clearPanelCache();
        localStorage.setItem(AGENCY_KEY, agencyId);
      }
    } catch {
      // Sem localStorage: segue sem a checagem.
    }
  }, [agencyId]);

  useEffect(() => {
    // Tela servida da cópia guardada: o service worker marca quando foi salva.
    const meta = document.querySelector<HTMLMetaElement>('meta[name="mcx-offline-saved-at"]');
    if (meta?.content) setSavedAt(Number(meta.content));
    const update = () => {
      setOnline(navigator.onLine);
      // O sinal voltou numa cópia guardada: carrega a tela de verdade.
      if (navigator.onLine && meta?.content) window.location.reload();
    };
    setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Navegação dentro do painel não passa pelo service worker como página: pede para guardar.
  useEffect(() => {
    if (!navigator.onLine || !navigator.serviceWorker?.controller) return;
    navigator.serviceWorker.controller.postMessage({ type: "painel-save", url: window.location.href });
  }, [pathname, search]);

  if (online && !savedAt) return null;
  const when = savedAt ? new Date(savedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div role="status" className="mb-4 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-[13px] text-warn no-print">
      <WifiOff className="size-4 mt-0.5 shrink-0" />
      <p>
        <strong>Sem internet — modo consulta.</strong>{" "}
        {when ? `Esta tela é a cópia salva neste aparelho em ${when}.` : "Os dados desta tela são de quando você a abriu."} Salvar, aprovar, importar e exportar precisam de internet. Quando o sinal voltar, toque em <strong>Atualizar dados</strong>.
      </p>
    </div>
  );
}
