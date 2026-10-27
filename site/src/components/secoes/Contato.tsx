import { TriangleAlert } from "lucide-react";
import { BotaoWhatsApp } from "@/components/BotaoWhatsApp";
import { FormularioInteresse } from "@/components/FormularioInteresse";
import { site } from "@/config/site";
import { conversao } from "@/content/conteudo";
import { whatsappOficial } from "@/lib/whatsapp";

const emDesenvolvimento = process.env.NODE_ENV !== "production";

export function Contato() {
  const configurado = Boolean(whatsappOficial);
  return (
    <section id="contato" aria-labelledby="contato-titulo" className="relative isolate overflow-hidden bg-navy-900 py-24 text-white sm:py-32">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_0%_0%,rgba(52,70,127,.55),transparent_60%)]"
      />
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-12 px-5 sm:px-8 lg:grid-cols-[.95fr_1.05fr] lg:gap-20">
        <div className="lg:sticky lg:top-28">
          <p className="inline-flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.26em] text-prata-300">
            <span className="h-px w-8 bg-prata-300/60" aria-hidden="true" />
            Contato
          </p>
          <h2 id="contato-titulo" className="mt-4 font-display text-[2.4rem] font-medium leading-[1.08] sm:text-6xl">
            {conversao.titulo}
          </h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-prata-300">{conversao.texto}</p>

          {configurado ? (
            <div className="mt-10">
              <BotaoWhatsApp variante="primario">{conversao.botao}</BotaoWhatsApp>
              <p className="mt-4 text-sm text-prata-400">
                Abre o WhatsApp oficial da {site.nomeCurto} com uma mensagem inicial. Você revisa antes de enviar.
              </p>
            </div>
          ) : emDesenvolvimento ? (
            <div role="note" className="mt-10 flex max-w-lg gap-3 rounded-2xl border border-dashed border-amber-400/70 bg-amber-400/10 p-5 text-amber-100">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p className="text-[15px] leading-relaxed">
                <strong className="font-semibold">Modo de desenvolvimento:</strong> o WhatsApp oficial ainda não foi configurado.
                Defina <code className="rounded bg-black/30 px-1.5 py-0.5 text-[13px]">NEXT_PUBLIC_WHATSAPP</code> ou{" "}
                <code className="rounded bg-black/30 px-1.5 py-0.5 text-[13px]">contato.whatsapp</code> em{" "}
                <code className="rounded bg-black/30 px-1.5 py-0.5 text-[13px]">src/config/site.ts</code>. Este aviso não aparece no site publicado.
              </p>
            </div>
          ) : (
            <p className="mt-10 max-w-lg rounded-2xl border border-white/15 p-5 text-prata-300">
              Nossos canais de atendimento estarão disponíveis aqui em breve.
            </p>
          )}

          {site.contato.email && (
            <p className="mt-8 text-prata-300">
              Prefere e-mail?{" "}
              <a href={`mailto:${site.contato.email}`} className="font-medium text-white underline underline-offset-4">
                {site.contato.email}
              </a>
            </p>
          )}
        </div>

        {(configurado || emDesenvolvimento) && <FormularioInteresse configurado={configurado} />}
      </div>
    </section>
  );
}
