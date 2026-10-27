import type { DadosInteresse } from "@/lib/whatsapp";

export const LIMITE_NECESSIDADE = 500;

export type ErrosInteresse = Partial<Record<keyof DadosInteresse, string>>;

/** Valida o formulário de interesse. Objeto vazio = tudo certo. */
export function validarInteresse(d: DadosInteresse): ErrosInteresse {
  const erros: ErrosInteresse = {};
  const nome = d.nome.trim();
  const empresa = d.empresa.trim();
  if (nome.length < 2) erros.nome = "Informe seu nome.";
  else if (nome.length > 80) erros.nome = "Use no máximo 80 caracteres.";
  if (empresa.length < 2) erros.empresa = "Informe o nome da empresa.";
  else if (empresa.length > 100) erros.empresa = "Use no máximo 100 caracteres.";
  if (!d.servico.trim()) erros.servico = "Escolha o serviço de interesse.";
  if (d.necessidade.length > LIMITE_NECESSIDADE) erros.necessidade = `Use no máximo ${LIMITE_NECESSIDADE} caracteres.`;
  return erros;
}
