import { ArrowRight, Check } from "lucide-react";
import Image from "next/image";
import { BotaoWhatsApp, classeBotao } from "@/components/BotaoWhatsApp";
import { Icone, type NomeIcone } from "@/components/Icone";
import { site } from "@/config/site";
import { hero } from "@/content/conteudo";

// Linhas da composição ilustrativa: representam as duas frentes, sem dados reais.
const rotina: { icone: NomeIcone; titulo: string; detalhe: string; frente: "campo" | "gestao" }[] = [
  { icone: "MapPin", titulo: "Roteiro de visitas", detalhe: "Rotas e lojas previstas", frente: "campo" },
  { icone: "Camera", titulo: "Registro fotográfico", detalhe: "Antes e depois da execução", frente: "campo" },
  { icone: "Tag", titulo: "Pesquisa de preços", detalhe: "Informações do ponto de venda", frente: "campo" },
  { icone: "Receipt", titulo: "Conferência de recebimentos", detalhe: "Controles definidos com o cliente", frente: "gestao" },
  { icone: "FolderOpen", titulo: "Documentos organizados", detalhe: "Demandas administrativas", frente: "gestao" },
];

function ComposicaoIlustrativa() {
  return (
    <figure className="relative mx-auto w-full max-w-[460px]" aria-label="Ilustração da rotina de uma operação acompanhada">
      <div className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(closest-side,rgba(148,163,196,.18),transparent)]" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-white/[0.04] p-5 shadow-[0_40px_80px_-40px_rgba(0,0,0,.8)] backdrop-blur-sm sm:p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-prata-400">Rotina da operação</p>
            <p className="mt-1 font-display text-2xl text-white">Acompanhamento</p>
          </div>
          <Image src={site.logo.monogramaClaro} alt="" width={240} height={143} className="h-7 w-auto opacity-70" />
        </div>
        <ul className="mt-4 space-y-2.5" aria-hidden="true">
          {rotina.map((item, i) => (
            <li
              key={item.titulo}
              className="animate-subir flex items-center gap-3.5 rounded-2xl border border-white/8 bg-navy-950/40 px-3.5 py-3"
              style={{ animationDelay: `${150 + i * 90}ms` }}
            >
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                  item.frente === "campo" ? "bg-prata-100 text-navy-900" : "bg-navy-600 text-prata-100"
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
        <div className="mt-4 flex flex-wrap gap-2 text-[12px] text-prata-300" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1">
            <span className="size-2 rounded-full bg-prata-100" /> Operações comerciais
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1">
            <span className="size-2 rounded-full bg-navy-600 ring-1 ring-prata-300/50" /> Administrativo e financeiro
          </span>
        </div>
      </div>
      <figcaption className="sr-only">
        Composição ilustrativa com exemplos de atividades de campo e de rotinas administrativas. Não representa dados de clientes.
      </figcaption>
    </figure>
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
