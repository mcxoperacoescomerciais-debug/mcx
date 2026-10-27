/**
 * CONFIGURAÇÃO CENTRAL DO SITE DA MCX
 *
 * Todos os dados institucionais ficam aqui. Campos vazios ("") ou `null`
 * simplesmente não aparecem no site — nada é inventado para preencher lacunas.
 *
 * O WhatsApp e o endereço do site também podem vir das variáveis de ambiente
 * NEXT_PUBLIC_WHATSAPP e NEXT_PUBLIC_SITE_URL (veja .env.example); quando
 * definidas, elas têm prioridade sobre o valor escrito aqui.
 */

export type RedeSocial = { nome: "Instagram" | "LinkedIn" | "Facebook" | "YouTube"; url: string };

export const site = {
  nome: "MCX Operações Comerciais",
  nomeCurto: "MCX",

  /** Endereço definitivo, sem barra no final. Ex.: "https://www.seudominio.com.br". PENDENTE. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "",

  logo: {
    /** Logo oficial completa (fundo azul). */
    original: "/mcx-logo.png",
    /** Versões geradas por `npm run icons` a partir da oficial. */
    claraSobreEscuro: "/brand/logo-prata.png",
    escuraSobreClaro: "/brand/logo-navy.png",
    monogramaClaro: "/brand/monograma-prata.png",
    alt: "MCX Operações Comerciais",
  },

  contato: {
    /** WhatsApp oficial, com DDI 55 + DDD + número (só dígitos). PENDENTE. */
    whatsapp: process.env.NEXT_PUBLIC_WHATSAPP ?? "",
    /** E-mail institucional. PENDENTE — só aparece quando preenchido. */
    email: "",
  },

  /** Mensagem padrão ao abrir o WhatsApp pelos botões gerais. */
  mensagemPadrao:
    "Olá! Acessei o site da MCX Operações Comerciais e gostaria de conhecer melhor as soluções oferecidas.",

  /** Preencha apenas com perfis oficiais. Lista vazia = seção oculta. */
  redesSociais: [] as RedeSocial[],

  /** Dados do rodapé. Todos PENDENTES — só aparecem quando preenchidos. */
  empresa: {
    razaoSocial: "",
    cnpj: "",
    endereco: "",
  },

  seo: {
    titulo: "MCX Operações Comerciais | Soluções para sua operação",
    descricao:
      "Conheça as soluções da MCX Operações Comerciais em suporte à operação e à promotoria, rotinas administrativas e financeiras e sistemas personalizados.",
    imagemCompartilhamento: "/og-image.png",
  },

  /**
   * Fotos próprias da MCX (opcional). Enquanto estiver `null`, o site usa a
   * composição ilustrativa. Para trocar, coloque a foto em public/fotos/ e
   * informe { src: "/fotos/arquivo.jpg", alt: "descrição da foto" }.
   */
  imagens: {
    hero: null as { src: string; alt: string } | null,
  },
};
