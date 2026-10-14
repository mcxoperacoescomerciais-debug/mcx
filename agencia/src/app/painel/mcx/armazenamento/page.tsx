import type { Metadata } from "next";
import { HardDrive } from "lucide-react";
import { requirePlatform } from "@/server/auth";
import { getStorageAlertConfig, measureStorage } from "@/server/storage-alert";
import { PageHeader, Progress, inputClass } from "@/components/ui";
import { SectionCard } from "../../_components/widgets";
import { ActionForm } from "../../_components/action-form";
import { saveStorageAlertAction, storageReportNowAction } from "../actions";

export const metadata: Metadata = { title: "Armazenamento" };

const GB = 1024 ** 3;
const fmt = (b: number) => (b >= GB ? `${String(Number((b / GB).toFixed(2))).replace(".", ",")} GB` : `${Math.round(b / 1024 ** 2)} MB`);

/** Espaço do sistema inteiro (todas as agências) e o aviso no WhatsApp da MCX. */
export default async function StoragePage() {
  await requirePlatform();
  const [u, cfg] = await Promise.all([measureStorage(), getStorageAlertConfig()]);
  const rows = [
    { label: "Fotos", used: u.photosBytes, limit: u.photosLimit, note: u.photosEstimated ? "estimado pelas fotos registradas" : "bucket de fotos" },
    { label: "Banco de dados", used: u.dbBytes, limit: u.dbLimit, note: "cadastros, visitas e registros" },
  ];
  return (
    <>
      <PageHeader eyebrow="MCX · plataforma" title="Armazenamento" subtitle="Espaço usado pelo sistema inteiro (todas as agências) frente ao limite do plano contratado." />
      <div className="grid xl:grid-cols-2 gap-6">
        <SectionCard title="Uso atual" bodyClass="px-5 pb-5 space-y-5">
          {rows.map((r) => {
            const pct = Math.round((r.used / r.limit) * 100);
            return (
              <div key={r.label}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-[14px] flex items-center gap-1.5">
                    <HardDrive className="size-4 text-muted" /> {r.label}
                  </p>
                  <p className="text-[13px] tnum">
                    <strong>{fmt(r.used)}</strong> de {fmt(r.limit)} · <strong className={pct >= 100 ? "text-bad" : pct >= 80 ? "text-warn" : ""}>{pct}%</strong>
                  </p>
                </div>
                <Progress value={r.used} total={r.limit} className="mt-2 h-2" tone={pct >= 100 ? "danger" : pct >= 80 ? "warning" : "success"} />
                <p className="text-[11.5px] text-muted mt-1">{r.note}</p>
              </div>
            );
          })}
          <p className="text-[12px] text-muted">Limites do plano gratuito do Supabase. Ao migrar as fotos para o Cloudflare R2, o limite das fotos passa a 10 GB.</p>
        </SectionCard>

        <SectionCard title="Aviso no WhatsApp da MCX" subtitle="Toda segunda às 8h: o relatório da semana (uso, crescimento e previsão). Em qualquer dia: alerta ao passar de 80% e de 100%." bodyClass="px-5 pb-5 space-y-4">
          <ActionForm action={saveStorageAlertAction} hidden={{}} submitLabel="Salvar" resetOnSuccess={false}>
            <label className="block">
              <span className="text-[13px] font-semibold text-ink-2">Número do WhatsApp (com DDD; vários: separe por vírgula)</span>
              <input name="phone" defaultValue={cfg.phone} placeholder="31 99999-8888" className={inputClass + " mt-1"} />
            </label>
            <label className="block">
              <span className="text-[13px] font-semibold text-ink-2">{cfg.hasKey ? "Chave do CallMeBot — salva ✓ (vazio mantém; digite apagar para remover)" : "Chave (apikey) do CallMeBot"}</span>
              <input name="apikey" type="password" autoComplete="off" placeholder={cfg.hasKey ? "••••••• (salva)" : "ex.: 1234567"} className={inputClass + " mt-1"} />
            </label>
            <label className="inline-flex items-center gap-2 text-[13.5px] font-medium">
              <input type="checkbox" name="enabled" defaultChecked={cfg.enabled} /> Enviar o aviso de armazenamento
            </label>
          </ActionForm>
          <ActionForm action={storageReportNowAction} hidden={{}} submitLabel="Enviar aviso agora" variant="secondary" resetOnSuccess={false}>
            <p className="text-[13px] text-ink-2">Envia já o relatório (o mesmo da segunda-feira) para conferir se está chegando.</p>
          </ActionForm>
        </SectionCard>
      </div>
    </>
  );
}
