"use client";

/** Troca o promotor na Rota Promotor sem voltar à lista. */
import { useRouter } from "next/navigation";
import { selectClass } from "@/components/ui";

export function PromoterSwitcher({ promoters, current }: { promoters: { id: string; name: string }[]; current?: string }) {
  const router = useRouter();
  return (
    <select aria-label="Escolher promotor" value={current ?? ""} onChange={(e) => e.target.value && router.push(`/painel/cadastros/rota/${e.target.value}`)} className={selectClass + " !h-9 !w-auto min-w-56"}>
      {current ? null : <option value="">Escolha o promotor…</option>}
      {promoters.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
