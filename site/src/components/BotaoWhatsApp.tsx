import { MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import { linkWhatsAppMcx } from "@/lib/whatsapp";

const emDesenvolvimento = process.env.NODE_ENV !== "production";

const estilos = {
  primario:
    "bg-prata-100 text-navy-900 hover:bg-white shadow-[0_1px_0_rgba(255,255,255,.4)_inset,0_8px_24px_-12px_rgba(0,0,0,.6)]",
  escuro: "bg-navy-900 text-white hover:bg-navy-700",
  contorno: "border border-navy-900/20 text-navy-900 hover:border-navy-900 hover:bg-navy-900 hover:text-white",
  link: "text-navy-800 underline-offset-4 hover:underline px-0! py-0! min-h-0!",
};

export type VarianteBotao = keyof typeof estilos;

export const classeBotao = (variante: VarianteBotao, extra = "") =>
  `inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold tracking-[0.01em] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-aco ${estilos[variante]} ${extra}`;

type Props = {
  children: ReactNode;
  mensagem?: string;
  variante?: VarianteBotao;
  className?: string;
  /** Mostra o ícone do WhatsApp antes do texto. */
  icone?: boolean;
  /**
   * O que mostrar quando o WhatsApp ainda não foi configurado em produção.
   * Por padrão o botão some — nunca leva a uma conversa inválida.
   */
  semContato?: ReactNode;
};

/**
 * Botão que abre o WhatsApp oficial com uma mensagem pré-preenchida.
 * Sem número configurado: em desenvolvimento mostra um aviso; em produção, `semContato`.
 */
export function BotaoWhatsApp({ children, mensagem, variante = "escuro", className = "", icone = true, semContato = null }: Props) {
  const href = linkWhatsAppMcx(mensagem);

  if (!href) {
    if (!emDesenvolvimento) return <>{semContato}</>;
    const dica = "Defina NEXT_PUBLIC_WHATSAPP (ou contato.whatsapp em src/config/site.ts)";
    if (variante === "link") {
      return (
        <span title={dica} className="inline-flex flex-wrap items-center gap-2 text-sm text-amber-600">
          <span className="rounded border border-dashed border-amber-500 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
            WhatsApp a configurar
          </span>
        </span>
      );
    }
    return (
      <span
        title={dica}
        className={`inline-flex min-h-12 items-center gap-2 rounded-full border border-dashed border-amber-500 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-900 ${className}`}
      >
        <span className="font-semibold">WhatsApp a configurar</span> · {children}
      </span>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classeBotao(variante, className)}>
      {icone && <MessageCircle className="size-[18px] shrink-0" aria-hidden="true" />}
      {children}
      <span className="sr-only"> (abre o WhatsApp em uma nova aba)</span>
    </a>
  );
}
