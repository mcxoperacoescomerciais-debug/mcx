import Image from "next/image";
import { Icone } from "@/components/Icone";
import { TituloSecao } from "@/components/TituloSecao";
import { site } from "@/config/site";
import { diferenciais } from "@/content/conteudo";

export function Diferenciais() {
  return (
    <section id="diferenciais" aria-labelledby="diferenciais-titulo" className="relative isolate overflow-hidden bg-navy-950 py-24 text-white sm:py-32">
      <Image
        src={site.logo.monogramaClaro}
        alt=""
        width={240}
        height={143}
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 top-1/2 -z-10 w-[640px] max-w-none -translate-y-1/2 opacity-[0.04]"
      />
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-14 px-5 sm:px-8 lg:grid-cols-[.85fr_1.15fr] lg:gap-20">
        <TituloSecao id="diferenciais-titulo" rotulo="Diferenciais" titulo={diferenciais.titulo} descricao={diferenciais.texto} claro />
        <ul className="grid gap-x-10 sm:grid-cols-2">
          {diferenciais.itens.map((d) => (
            <li key={d.titulo} className="flex items-start gap-4 border-t border-white/12 py-6">
              <Icone nome={d.icone} className="mt-0.5 size-6 shrink-0 text-prata-300" />
              <span className="text-lg leading-snug text-prata-100">{d.titulo}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
