import { Icone } from "@/components/Icone";
import { TituloSecao } from "@/components/TituloSecao";
import { perfis } from "@/content/conteudo";

export function ParaQuem() {
  return (
    <section id="para-quem" aria-labelledby="para-quem-titulo" className="bg-papel py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <TituloSecao
          id="para-quem-titulo"
          rotulo="Para quem trabalhamos"
          titulo="Para empresas que querem mais controle sobre a rotina."
        />
        <ul className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-linha bg-linha sm:grid-cols-2">
          {perfis.map((p) => (
            <li key={p.titulo} className="flex gap-5 bg-white p-7 sm:p-9">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-navy-900/15 text-navy-900">
                <Icone nome={p.icone} className="size-[22px]" />
              </span>
              <div>
                <h3 className="text-xl font-semibold leading-snug text-navy-900">{p.titulo}</h3>
                <p className="mt-3 leading-relaxed text-tinta-suave">{p.texto}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
