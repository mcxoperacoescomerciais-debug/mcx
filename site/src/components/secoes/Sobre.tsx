import { Icone } from "@/components/Icone";
import { TituloSecao } from "@/components/TituloSecao";
import { sobre } from "@/content/conteudo";

export function Sobre() {
  return (
    <section id="sobre" aria-labelledby="sobre-titulo" className="bg-papel py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-14 px-5 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:gap-20">
        <div>
          <TituloSecao id="sobre-titulo" rotulo="Sobre a MCX" titulo={sobre.titulo} />
          <div className="mt-8 space-y-5 text-lg leading-relaxed text-tinta-suave">
            {sobre.paragrafos.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-end gap-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-tinta-suave">Duas frentes de atuação</p>
          {sobre.frentes.map((f, i) => (
            <div key={f.titulo} className="flex gap-5 rounded-3xl border border-linha bg-white p-6 sm:p-7">
              <span className="font-display text-4xl leading-none text-prata-400" aria-hidden="true">
                0{i + 1}
              </span>
              <div>
                <h3 className="flex items-center gap-2.5 text-lg font-semibold text-navy-900">
                  <Icone nome={f.icone} className="size-5 text-aco" />
                  {f.titulo}
                </h3>
                <p className="mt-2 leading-relaxed text-tinta-suave">{f.texto}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
