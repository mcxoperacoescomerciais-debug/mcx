import { Icone } from "@/components/Icone";
import { TituloSecao } from "@/components/TituloSecao";
import { etapas } from "@/content/conteudo";

export function ComoFunciona() {
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <TituloSecao
          id="como-funciona-titulo"
          rotulo="Como funciona"
          titulo="Do primeiro contato à execução."
          descricao="Um caminho simples para entender a sua operação e definir o suporte certo."
        />
        <ol className="relative mt-16 grid gap-10 md:grid-cols-2 md:gap-x-8 lg:grid-cols-4">
          {/* Linha que conecta as etapas no desktop. */}
          <span aria-hidden="true" className="absolute left-0 right-0 top-7 hidden h-px bg-linha lg:block" />
          {etapas.map((e, i) => (
            <li key={e.titulo} className="relative">
              <div className="flex items-center gap-4">
                <span className="relative flex size-14 items-center justify-center rounded-2xl bg-navy-900 text-prata-100 ring-8 ring-white">
                  <Icone nome={e.icone} className="size-6" />
                </span>
                <span className="font-display text-4xl text-prata-400" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-6 text-xl font-semibold text-navy-900">
                <span className="sr-only">Etapa {i + 1}: </span>
                {e.titulo}
              </h3>
              <p className="mt-3 leading-relaxed text-tinta-suave">{e.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
