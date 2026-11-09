"use client";

/**
 * Filtros do relatório mensal: marca, rede e promotor com caixinhas ("Marcar
 * todos" / "Desmarcar todos"; nenhum marcado = todos) e "Limpar filtros".
 * Várias marcas saem numa planilha só, com a marca em cada linha.
 */
import { useState } from "react";
import { FileSpreadsheet, RotateCcw } from "lucide-react";
import { inputClass } from "@/components/ui";
import { SearchSelect } from "../_components/search-select";

type Option = { id: string; name: string };

export function MonthlyReportForm({ brands, chains, promoters, month: initialMonth, brand: initialBrand }: { brands: Option[]; chains: Option[]; promoters: Option[]; month: string; brand: string }) {
  const [brand, setBrand] = useState(initialBrand);
  const [chain, setChain] = useState("");
  const [promoter, setPromoter] = useState("");
  const [month, setMonth] = useState(initialMonth);
  const active = Boolean(brand || chain || promoter || month !== initialMonth);
  const brandCount = brand ? brand.split(",").length : brands.length;

  return (
    <form action="/api/reports/monthly" method="get" className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="brand" value={brand} />
      <input type="hidden" name="chain" value={chain} />
      <input type="hidden" name="promoter" value={promoter} />
      <div className="text-[12.5px] font-semibold text-ink-2">
        Marca (indústria)
        <SearchSelect className="mt-1" label="Todas as marcas" value={brand || undefined} items={brands} multiple onChange={(v) => setBrand(v ?? "")} />
      </div>
      <label className="text-[12.5px] font-semibold text-ink-2">
        Mês
        <input type="month" name="month" required value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass + " mt-1 h-9 w-[170px]"} />
      </label>
      <div className="text-[12.5px] font-semibold text-ink-2">
        Rede
        <SearchSelect className="mt-1" label="Todas as redes" value={chain || undefined} items={chains} multiple onChange={(v) => setChain(v ?? "")} />
      </div>
      <div className="text-[12.5px] font-semibold text-ink-2">
        Promotor
        <SearchSelect className="mt-1" label="Todos os promotores" value={promoter || undefined} items={promoters} multiple onChange={(v) => setPromoter(v ?? "")} />
      </div>
      {active ? (
        <button
          type="button"
          onClick={() => {
            setBrand("");
            setChain("");
            setPromoter("");
            setMonth(initialMonth);
          }}
          className="h-9 px-3 rounded-lg text-[13px] font-semibold text-brand-700 hover:bg-brand-50 inline-flex items-center gap-1.5"
        >
          <RotateCcw className="size-3.5" /> Limpar filtros
        </button>
      ) : null}
      <button type="submit" className="h-9 px-4 rounded-lg bg-brand-800 text-white text-[13.5px] font-semibold inline-flex items-center gap-2 hover:bg-brand-900 ml-auto">
        <FileSpreadsheet className="size-4" /> Baixar Excel{brandCount > 1 ? ` (${brandCount} marcas)` : ""}
      </button>
    </form>
  );
}
