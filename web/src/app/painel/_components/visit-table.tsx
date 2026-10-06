import Link from "next/link";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui";
import { formatIsoBr } from "@/lib/validity";
import type { VisitRow } from "@/server/visit-list";

const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

export function VisitTable({ rows, showStore = true, showPromoter = true }: { rows: VisitRow[]; showStore?: boolean; showPromoter?: boolean }) {
  if (!rows.length) return <p className="px-5 py-6 text-[13px] text-muted">Nenhuma visita no período.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-y border-line bg-navy-50/50">
            <th className="font-semibold px-5 py-2">Data</th>
            {showStore ? <th className="font-semibold px-3 py-2">Loja</th> : null}
            {showPromoter ? <th className="font-semibold px-3 py-2">Promotor</th> : null}
            <th className="font-semibold px-3 py-2">Ocorrências</th>
            <th className="font-semibold px-3 py-2">Status</th>
            <th className="font-semibold px-5 py-2 text-right">Relatório</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} className="border-b border-line last:border-0 hover:bg-navy-50/40">
              <td className="px-5 py-2.5 tnum">
                <Link href={`/painel/visitas/${v.id}`} className="font-semibold hover:underline">
                  {formatIsoBr(v.visitDate)}
                </Link>
                <div className="text-[12px] text-muted">
                  {timeFmt.format(v.startedAt)}
                  {v.finishedAt ? ` – ${timeFmt.format(v.finishedAt)}` : ""}
                </div>
              </td>
              {showStore ? (
                <td className="px-3">
                  <Link href={`/painel/lojas/${v.storeId}`} className="hover:underline">
                    {v.storeName}
                    {v.storeCode ? ` · ${v.storeCode}` : ""}
                  </Link>
                  <div className="text-[12px] text-muted">{v.city}</div>
                </td>
              ) : null}
              {showPromoter ? <td className="px-3">{v.promoterName}</td> : null}
              <td className="px-3">
                <div className="flex flex-wrap gap-1">
                  <Badge>{v.validity + v.stock} validades</Badge>
                  {v.expired ? <Badge tone="red">{v.expired} vencidos</Badge> : null}
                  {v.critical ? <Badge tone="orange">{v.critical} críticos</Badge> : null}
                  {v.ruptures ? <Badge tone="blue">{v.ruptures} rupturas</Badge> : null}
                  {v.damages ? <Badge tone="gold">{v.damages} avarias</Badge> : null}
                </div>
              </td>
              <td className="px-3">{v.status === "finished" ? <Badge tone="green">Finalizada</Badge> : <Badge tone="orange">Em andamento</Badge>}</td>
              <td className="px-5 text-right">
                <a href={`/api/visits/${v.id}/pdf?inline=1`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-navy-700 hover:underline">
                  <FileText className="size-3.5" /> PDF
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
