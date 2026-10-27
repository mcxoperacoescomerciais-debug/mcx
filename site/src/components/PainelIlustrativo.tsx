import { Check } from "lucide-react";
import Image from "next/image";
import { Icone, type NomeIcone } from "@/components/Icone";
import { site } from "@/config/site";

export type ItemPainel = { icone: NomeIcone; titulo: string; detalhe: string; destaque?: boolean };

/**
 * Cartão escuro com uma lista de atividades marcadas como concluídas. É uma
 * composição ilustrativa: não mostra dados de clientes.
 */
export function PainelIlustrativo({
  rotulo,
  titulo,
  itens,
  descricao,
  className = "",
}: {
  rotulo: string;
  titulo: string;
  itens: ItemPainel[];
  descricao: string;
  className?: string;
}) {
  return (
    <figure className={`relative mx-auto w-full max-w-[460px] ${className}`}>
      <div className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(closest-side,rgba(148,163,196,.18),transparent)]" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-white/[0.04] p-5 shadow-[0_40px_80px_-40px_rgba(0,0,0,.8)] backdrop-blur-sm sm:p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-prata-400">{rotulo}</p>
            <p className="mt-1 font-display text-2xl text-white">{titulo}</p>
          </div>
          <Image src={site.logo.monogramaClaro} alt="" width={240} height={143} className="h-7 w-auto opacity-70" />
        </div>
        <ul className="mt-4 space-y-2.5" aria-hidden="true">
          {itens.map((item, i) => (
            <li
              key={item.titulo}
              className="animate-subir flex items-center gap-3.5 rounded-2xl border border-white/8 bg-navy-950/40 px-3.5 py-3"
              style={{ animationDelay: `${150 + i * 90}ms` }}
            >
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                  item.destaque === false ? "bg-navy-600 text-prata-100" : "bg-prata-100 text-navy-900"
                }`}
              >
                <Icone nome={item.icone} className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium leading-snug text-white">{item.titulo}</span>
                <span className="block text-[13px] leading-snug text-prata-400">{item.detalhe}</span>
              </span>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-prata-300/40 text-prata-200">
                <Check className="size-3.5" aria-hidden="true" />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="sr-only">{descricao}</figcaption>
    </figure>
  );
}
