import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { BotaoWhatsApp, classeBotao } from "@/components/BotaoWhatsApp";
import { PainelIlustrativo } from "@/components/PainelIlustrativo";
import { site } from "@/config/site";
import { hero, sobre } from "@/content/conteudo";

// Composição ilustrativa do topo: as três frentes da MCX, sem dados reais.
function ComposicaoIlustrativa() {
  return (
    <PainelIlustrativo
      rotulo="Como a MCX apoia"
      titulo="Três frentes"
      descricao="Composição ilustrativa com as três frentes de atuação da MCX. Não representa dados de clientes."
      itens={sobre.frentes.map((f) => ({ icone: f.icone, titulo: f.titulo, detalhe: f.texto }))}
    />
  );
}

export function Hero() {
  const foto = site.imagens.hero;
  return (
    <section id="inicio" className="relative isolate overflow-hidden bg-navy-900 text-white">
      {/* Textura discreta: linhas finas inspiradas no traço da logo. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(115deg,transparent_0_58%,rgba(201,207,203,.07)_58%_58.2%,transparent_58.2%),linear-gradient(115deg,transparent_0_72%,rgba(201,207,203,.05)_72%_72.15%,transparent_72.15%)]"
      />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent to-navy-950/60" />

      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-5 pb-20 pt-32 sm:px-8 md:pb-24 lg:min-h-[min(100svh,860px)] lg:grid-cols-[1.12fr_.88fr] lg:gap-16 lg:pt-36">
        <div className="animate-subir">
          <p className="mb-6 inline-flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.28em] text-prata-300">
            <span className="h-px w-8 bg-prata-300/60" aria-hidden="true" />
            {site.nome}
          </p>
          <h1 className="font-display text-[2.6rem] font-medium leading-[1.04] tracking-[-0.01em] text-white sm:text-6xl lg:text-[4.4rem]">
            {hero.titulo}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-prata-300 sm:text-xl">{hero.subtitulo}</p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <BotaoWhatsApp variante="primario" semContato={null}>
              {hero.botaoPrincipal}
            </BotaoWhatsApp>
            <a
              href="#solucoes"
              className={classeBotao(
                "contorno",
                "border-white/25! text-white! hover:border-white! hover:bg-white/8! hover:text-white!",
              )}
            >
              {hero.botaoSecundario}
              <ArrowRight className="size-[18px]" aria-hidden="true" />
            </a>
          </div>
        </div>

        {foto ? (
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl">
            <Image src={foto.src} alt={foto.alt} fill priority sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
          </div>
        ) : (
          <ComposicaoIlustrativa />
        )}
      </div>
    </section>
  );
}
