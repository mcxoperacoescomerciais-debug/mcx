"use client";

import { MessageCircle } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { classeBotao } from "@/components/BotaoWhatsApp";
import { opcoesInteresse } from "@/content/conteudo";
import { LIMITE_NECESSIDADE, validarInteresse, type ErrosInteresse as Erros } from "@/lib/formulario";
import { linkWhatsAppMcx, mensagemInteresse, type DadosInteresse } from "@/lib/whatsapp";

const vazio: DadosInteresse = { nome: "", empresa: "", servico: "", necessidade: "" };

const classeCampo =
  "mt-2 block w-full rounded-xl border bg-white px-4 py-3 text-base text-navy-900 placeholder:text-tinta-suave/60 transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-aco";

/**
 * Formulário curto que monta uma mensagem e abre o WhatsApp oficial.
 * Nada é enviado pelo site: o visitante revisa e envia no próprio aplicativo.
 */
export function FormularioInteresse({ configurado }: { configurado: boolean }) {
  const [dados, setDados] = useState<DadosInteresse>(vazio);
  const [erros, setErros] = useState<Erros>({});
  const [status, setStatus] = useState<"" | "aberto">("");
  const formRef = useRef<HTMLFormElement>(null);
  const uid = useId();
  const id = (campo: string) => `${uid}-${campo}`;

  const alterar = (campo: keyof DadosInteresse, valor: string) => {
    setDados((d) => ({ ...d, [campo]: valor }));
    if (erros[campo]) setErros((e) => ({ ...e, [campo]: undefined }));
    setStatus("");
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const encontrados = validarInteresse(dados);
    setErros(encontrados);
    const primeiro = (Object.keys(encontrados) as (keyof DadosInteresse)[])[0];
    if (primeiro) {
      formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id(primeiro))}`)?.focus();
      return;
    }
    const link = linkWhatsAppMcx(mensagemInteresse(dados));
    if (!link) return;
    window.open(link, "_blank", "noopener,noreferrer");
    setStatus("aberto");
  };

  const descricaoErro = (campo: keyof DadosInteresse) =>
    erros[campo] ? (
      <p id={id(`${campo}-erro`)} className="mt-1.5 text-sm font-medium text-erro">
        {erros[campo]}
      </p>
    ) : null;

  const borda = (campo: keyof DadosInteresse) => (erros[campo] ? "border-erro" : "border-linha-forte");
  const aria = (campo: keyof DadosInteresse) => ({
    "aria-invalid": erros[campo] ? true : undefined,
    "aria-describedby": erros[campo] ? id(`${campo}-erro`) : undefined,
  });

  return (
    <form ref={formRef} onSubmit={enviar} noValidate className="rounded-3xl bg-white p-6 text-navy-900 shadow-[0_40px_80px_-40px_rgba(0,0,0,.6)] sm:p-8">
      <h3 className="font-display text-3xl font-medium">Conte rapidamente sua necessidade</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-tinta-suave">
        Preparamos a mensagem para você. O WhatsApp abre com o texto pronto e o envio só acontece quando você confirmar no
        aplicativo.
      </p>

      <fieldset disabled={!configurado} className="mt-6 grid gap-5 disabled:opacity-60 sm:grid-cols-2">
        <div>
          <label htmlFor={id("nome")} className="text-sm font-semibold">
            Nome
          </label>
          <input
            id={id("nome")}
            name="nome"
            autoComplete="name"
            maxLength={80}
            value={dados.nome}
            onChange={(e) => alterar("nome", e.target.value)}
            className={`${classeCampo} ${borda("nome")}`}
            {...aria("nome")}
          />
          {descricaoErro("nome")}
        </div>
        <div>
          <label htmlFor={id("empresa")} className="text-sm font-semibold">
            Empresa
          </label>
          <input
            id={id("empresa")}
            name="empresa"
            autoComplete="organization"
            maxLength={100}
            value={dados.empresa}
            onChange={(e) => alterar("empresa", e.target.value)}
            className={`${classeCampo} ${borda("empresa")}`}
            {...aria("empresa")}
          />
          {descricaoErro("empresa")}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={id("servico")} className="text-sm font-semibold">
            Serviço de interesse
          </label>
          <select
            id={id("servico")}
            name="servico"
            value={dados.servico}
            onChange={(e) => alterar("servico", e.target.value)}
            className={`${classeCampo} ${borda("servico")} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 fill=%22none%22 stroke=%22%23000D36%22 stroke-width=%221.6%22><path d=%22m5 8 5 5 5-5%22/></svg>')] bg-[right_0.9rem_center] bg-no-repeat pr-11`}
            {...aria("servico")}
          >
            <option value="">Selecione</option>
            {opcoesInteresse.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {descricaoErro("servico")}
        </div>
        <div className="sm:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={id("necessidade")} className="text-sm font-semibold">
              Breve descrição da necessidade <span className="font-normal text-tinta-suave">(opcional)</span>
            </label>
            <span className="text-xs tabular-nums text-tinta-suave" aria-hidden="true">
              {dados.necessidade.length}/{LIMITE_NECESSIDADE}
            </span>
          </div>
          <textarea
            id={id("necessidade")}
            name="necessidade"
            rows={4}
            maxLength={LIMITE_NECESSIDADE}
            value={dados.necessidade}
            onChange={(e) => alterar("necessidade", e.target.value)}
            placeholder="Ex.: preciso de apoio para acompanhar as visitas da equipe de campo."
            className={`${classeCampo} ${borda("necessidade")} resize-y`}
            {...aria("necessidade")}
          />
          {descricaoErro("necessidade")}
        </div>
      </fieldset>

      <p className="mt-4 text-[13px] leading-relaxed text-tinta-suave">
        Não informe dados pessoais sensíveis, senhas ou informações financeiras. Os dados não ficam salvos no site.
      </p>

      <button type="submit" disabled={!configurado} className={classeBotao("escuro", "mt-6 w-full disabled:cursor-not-allowed disabled:opacity-60")}>
        <MessageCircle className="size-[18px]" aria-hidden="true" />
        Preparar mensagem no WhatsApp
      </button>

      <div role="status" aria-live="polite" className="empty:hidden mt-4 rounded-xl bg-prata-100 p-4 text-[15px] leading-relaxed text-navy-900">
        {status === "aberto" &&
          "Abrimos o WhatsApp com a sua mensagem em uma nova aba. Revise o texto e toque em enviar para que ela chegue à MCX. Se nada abriu, verifique se o navegador bloqueou a nova janela."}
      </div>
    </form>
  );
}
