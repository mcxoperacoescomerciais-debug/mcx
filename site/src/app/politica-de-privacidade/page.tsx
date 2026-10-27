import type { Metadata } from "next";
import Image from "next/image";
import { Rodape } from "@/components/Rodape";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: `Como o site da ${site.nome} trata as informações de quem o visita.`,
  alternates: { canonical: "/politica-de-privacidade/" },
};

/*
 * Texto-base, escrito a partir do que o site realmente faz hoje (sem banco de
 * dados, sem cookies e sem ferramentas de análise). Revise com a assessoria
 * jurídica da MCX e atualize sempre que o site passar a coletar dados.
 */
export default function PoliticaDePrivacidade() {
  const { empresa } = site;
  const controlador = [empresa.razaoSocial || site.nome, empresa.cnpj && `CNPJ ${empresa.cnpj}`].filter(Boolean).join(", ");

  return (
    <>
      <header className="bg-navy-900">
        <div className="mx-auto flex h-[72px] max-w-3xl items-center justify-between px-5 sm:px-8">
          <a href="/" aria-label={`${site.nome} — página inicial`}>
            <Image src={site.logo.monogramaClaro} alt="" width={240} height={143} className="h-9 w-auto" />
          </a>
          <a href="/" className="text-sm font-medium text-prata-200 hover:text-white">
            ← Voltar ao site
          </a>
        </div>
      </header>
      <main id="conteudo" className="bg-papel">
        <article className="mx-auto max-w-3xl px-5 py-16 text-[17px] leading-relaxed text-tinta-suave sm:px-8 sm:py-24 [&_h2]:mt-12 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-navy-900 [&_p]:mt-4 [&_li]:mt-2 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6">
          <h1 className="font-display text-5xl font-medium text-navy-900">Política de Privacidade</h1>
          <p>
            Esta política explica como o site da {site.nome} trata as informações de quem o visita, em conformidade com a Lei
            Geral de Proteção de Dados (Lei nº 13.709/2018).
          </p>

          <h2>Quem é o responsável</h2>
          <p>O responsável por este site é {controlador}.</p>

          <h2>Quais dados o site coleta</h2>
          <p>
            Este site não possui cadastro, área de login ou banco de dados, e não armazena as informações digitadas pelos
            visitantes.
          </p>
          <ul>
            <li>
              O formulário de interesse apenas monta uma mensagem com o nome, a empresa, o serviço escolhido e a descrição que
              você digitar. Ao confirmar, o WhatsApp é aberto com esse texto, e a mensagem só chega à MCX se você decidir
              enviá-la no aplicativo.
            </li>
            <li>Os botões de contato abrem o WhatsApp com uma mensagem inicial, que você pode alterar antes de enviar.</li>
            <li>O site não utiliza cookies de publicidade nem ferramentas de análise de navegação.</li>
          </ul>

          <h2>Comunicação pelo WhatsApp</h2>
          <p>
            As conversas iniciadas pelo WhatsApp são tratadas pela MCX apenas para responder ao seu contato e apresentar as
            soluções solicitadas. O uso do WhatsApp também está sujeito à política de privacidade do próprio aplicativo.
          </p>

          <h2>Serviços de terceiros</h2>
          <p>
            Como qualquer site, a hospedagem pode registrar dados técnicos de acesso, como endereço IP e tipo de navegador,
            para fins de segurança e funcionamento.
          </p>

          <h2>Seus direitos</h2>
          <p>
            Você pode solicitar informações, correção ou exclusão dos dados pessoais compartilhados com a MCX nas conversas de
            atendimento{site.contato.email ? <>, pelo e-mail {site.contato.email}</> : null} ou pelo mesmo canal em que entrou
            em contato.
          </p>

          <h2>Atualizações</h2>
          <p>Esta política pode ser atualizada sempre que o site passar a oferecer novos recursos.</p>
        </article>
      </main>
      <Rodape base="/" />
    </>
  );
}
