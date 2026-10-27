import { Info } from "lucide-react";
import { BotaoWhatsApp } from "@/components/BotaoWhatsApp";
import { Icone } from "@/components/Icone";
import { TituloSecao } from "@/components/TituloSecao";
import { PainelIlustrativo } from "@/components/PainelIlustrativo";
import { avisoEscopo, gruposSolucoes, type GrupoSolucoes, type Solucao } from "@/content/conteudo";
import { mensagemSolucao } from "@/lib/whatsapp";

function CartaoSolucao({ solucao, escuro }: { solucao: Solucao; escuro: boolean }) {
  return (
    <li
      className={`group flex flex-col rounded-3xl border p-6 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 sm:p-7 ${
        escuro
          ? "border-white/10 bg-white/[0.04] hover:border-white/25"
          : "border-linha bg-white hover:border-navy-900/25 hover:shadow-[0_24px_48px_-32px_rgba(0,13,54,.45)]"
      }`}
    >
      <span
        className={`flex size-12 items-center justify-center rounded-2xl ${
          escuro ? "bg-prata-100 text-navy-900" : "bg-navy-900 text-prata-100"
        }`}
      >
        <Icone nome={solucao.icone} className="size-[22px]" />
      </span>
      <h4 className={`mt-6 text-xl font-semibold leading-snug ${escuro ? "text-white" : "text-navy-900"}`}>
        {solucao.titulo}
      </h4>
      <p className={`mt-3 flex-1 leading-relaxed ${escuro ? "text-prata-300" : "text-tinta-suave"}`}>{solucao.descricao}</p>
      <div className="mt-6">
        <BotaoWhatsApp
          mensagem={mensagemSolucao(solucao.titulo)}
          variante="link"
          icone={false}
          className={escuro ? "text-prata-100!" : ""}
        >
          Consultar esta solução <span aria-hidden="true">→</span>
          <span className="sr-only">: {solucao.titulo}</span>
        </BotaoWhatsApp>
      </div>
    </li>
  );
}

function BlocoGrupo({ grupo, escuro }: { grupo: GrupoSolucoes; escuro: boolean }) {
  const idTitulo = `grupo-${grupo.rotulo.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div
      className={`rounded-[2rem] p-5 sm:p-8 lg:p-10 ${escuro ? "bg-navy-900 text-white" : "bg-prata-100/70 ring-1 ring-linha"}`}
      aria-labelledby={idTitulo}
      role="group"
    >
      <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <div>
          <p className={`text-[12px] font-semibold uppercase tracking-[0.24em] ${escuro ? "text-prata-400" : "text-aco"}`}>
            {grupo.rotulo}
          </p>
          <h3 id={idTitulo} className={`mt-2 font-display text-3xl font-medium sm:text-4xl ${escuro ? "text-white" : "text-navy-900"}`}>
            {grupo.titulo}
          </h3>
        </div>
        <p className={`max-w-sm ${escuro ? "text-prata-300" : "text-tinta-suave"}`}>{grupo.descricao}</p>
      </div>
      {grupo.painel ? (
        <div className="mt-8 grid grid-cols-1 items-center gap-10 lg:grid-cols-[.85fr_1.15fr] lg:gap-8">
          <PainelIlustrativo
            rotulo={grupo.painel.rotulo}
            titulo={grupo.painel.titulo}
            itens={grupo.painel.itens}
            descricao={`Exemplo ilustrativo do acompanhamento: ${grupo.painel.itens.map((i) => i.titulo).join(", ")}. Não representa dados de clientes.`}
          />
          <ul className="grid gap-4 sm:grid-cols-2">
            {grupo.solucoes.map((s) => (
              <CartaoSolucao key={s.titulo} solucao={s} escuro={escuro} />
            ))}
          </ul>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {grupo.solucoes.map((s) => (
            <CartaoSolucao key={s.titulo} solucao={s} escuro={escuro} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function Solucoes() {
  return (
    <section id="solucoes" aria-labelledby="solucoes-titulo" className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <TituloSecao
          id="solucoes-titulo"
          rotulo="Nossas soluções"
          titulo="Três frentes para apoiar a sua empresa."
          descricao="Da gestão das equipes de campo à rotina financeira e aos sistemas, a MCX estrutura o suporte de acordo com o que a sua empresa precisa."
        />
        <div className="mt-14 space-y-6">
          {gruposSolucoes.map((g, i) => (
            <BlocoGrupo key={g.rotulo} grupo={g} escuro={i % 2 === 0} />
          ))}
        </div>
        <p className="mt-8 flex max-w-3xl gap-3 text-[15px] leading-relaxed text-tinta-suave">
          <Info className="mt-0.5 size-5 shrink-0 text-aco" aria-hidden="true" />
          {avisoEscopo}
        </p>
      </div>
    </section>
  );
}
