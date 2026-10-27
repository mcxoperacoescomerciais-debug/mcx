/**
 * Geração de links de conversa do WhatsApp (wa.me).
 *
 * O número vem sempre da configuração central (src/config/site.ts). Nenhuma
 * mensagem é enviada pelo site: o link apenas abre o aplicativo com o texto
 * pronto, e o envio depende da confirmação do próprio visitante.
 */
import { site } from "@/config/site";

/**
 * Normaliza um número para o formato do wa.me (só dígitos, com DDI).
 * Aceita "+55 (11) 91234-5678", "5511912345678" ou "11912345678" (assume Brasil).
 * Devolve `null` quando o número está vazio ou não parece válido.
 */
export function normalizarNumero(bruto: string | undefined | null): string | null {
  const digitos = (bruto ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  // DDD + número (10 ou 11 dígitos) sem DDI: assume Brasil.
  const comDdi = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  if (comDdi.startsWith("55")) {
    return comDdi.length === 12 || comDdi.length === 13 ? comDdi : null;
  }
  // Outros países: faixa aceita pelo padrão E.164.
  return comDdi.length >= 8 && comDdi.length <= 15 ? comDdi : null;
}

/** Monta o link de conversa; `null` quando o número não é válido. */
export function montarLinkWhatsApp(numero: string | null | undefined, mensagem?: string): string | null {
  const n = normalizarNumero(numero);
  if (!n) return null;
  const texto = mensagem?.trim();
  return texto ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : `https://wa.me/${n}`;
}

/** Número oficial já normalizado (ou `null` se ainda não configurado). */
export const whatsappOficial = normalizarNumero(site.contato.whatsapp);

/** Link para o WhatsApp oficial da MCX. */
export function linkWhatsAppMcx(mensagem: string = site.mensagemPadrao): string | null {
  return montarLinkWhatsApp(whatsappOficial, mensagem);
}

/** Mensagem pré-preenchida para uma solução específica. */
export function mensagemSolucao(titulo: string): string {
  return `Olá! Acessei o site da MCX Operações Comerciais e gostaria de saber mais sobre a solução "${titulo}".`;
}

export type DadosInteresse = {
  nome: string;
  empresa: string;
  servico: string;
  necessidade: string;
};

/** Mensagem montada a partir do formulário de interesse (o visitante revisa antes de enviar). */
export function mensagemInteresse(d: DadosInteresse): string {
  const linhas = [
    "Olá! Acessei o site da MCX Operações Comerciais e gostaria de conversar sobre a minha operação.",
    "",
    `Nome: ${d.nome.trim()}`,
    `Empresa: ${d.empresa.trim()}`,
    `Interesse: ${d.servico.trim()}`,
  ];
  const necessidade = d.necessidade.trim();
  if (necessidade) linhas.push(`Necessidade: ${necessidade}`);
  return linhas.join("\n");
}
