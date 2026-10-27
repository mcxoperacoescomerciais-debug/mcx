import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import { BotaoWhatsApp } from "@/components/BotaoWhatsApp";
import { site } from "@/config/site";
import { navegacao } from "@/content/conteudo";

/** Rodapé. `base` prefixa as âncoras quando ele aparece fora da página inicial. */
export function Rodape({ base = "" }: { base?: string }) {
  const { empresa } = site;
  const ano = new Date().getFullYear();
  const titular = empresa.razaoSocial || site.nome;

  return (
    <footer className="bg-navy-950 text-prata-300">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-5 py-16 sm:px-8 md:grid-cols-[1.3fr_1fr_1fr] lg:py-20">
        <div>
          <Image src={site.logo.claraSobreEscuro} alt={site.logo.alt} width={480} height={402} className="h-28 w-auto" />
          <p className="mt-6 max-w-sm leading-relaxed">
            Suporte à operação e à promotoria, rotinas administrativas e financeiras e sistemas personalizados para empresas
            de qualquer área.
          </p>
        </div>

        <nav aria-label="Rodapé">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.24em] text-prata-400">Navegação</h2>
          <ul className="mt-5 space-y-3">
            {navegacao.map((item) => (
              <li key={item.id}>
                <a href={`${base}#${item.id}`} className="hover:text-white">
                  {item.rotulo}
                </a>
              </li>
            ))}
            <li>
              <a href="/politica-de-privacidade/" className="hover:text-white">
                Política de Privacidade
              </a>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.24em] text-prata-400">Atendimento</h2>
          <div className="mt-5 space-y-4">
            <BotaoWhatsApp variante="link" className="text-prata-100!" semContato={<p>Canais de atendimento em breve.</p>}>
              Falar pelo WhatsApp
            </BotaoWhatsApp>
            {site.contato.email && (
              <p>
                <a href={`mailto:${site.contato.email}`} className="hover:text-white">
                  {site.contato.email}
                </a>
              </p>
            )}
            {empresa.endereco && <p className="leading-relaxed">{empresa.endereco}</p>}
          </div>

          {site.redesSociais.length > 0 && (
            <ul className="mt-8 flex flex-wrap gap-2" aria-label="Redes sociais">
              {site.redesSociais.map((r) => (
                <li key={r.url}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3.5 py-1.5 text-sm hover:border-white/40 hover:text-white"
                  >
                    {r.nome}
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    <span className="sr-only"> (abre em nova aba)</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="border-t border-white/8">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-sm text-prata-400 sm:flex-row sm:justify-between sm:px-8">
          <p>
            © {ano} {titular}. Todos os direitos reservados.
          </p>
          {empresa.cnpj && <p>CNPJ {empresa.cnpj}</p>}
        </div>
      </div>
    </footer>
  );
}
