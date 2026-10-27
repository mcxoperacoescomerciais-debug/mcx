import type { ReactNode } from "react";

type Props = {
  rotulo: string;
  titulo: ReactNode;
  descricao?: ReactNode;
  id?: string;
  claro?: boolean;
  centralizado?: boolean;
};

/** Cabeçalho padrão das seções: rótulo pequeno, título (h2) e texto de apoio. */
export function TituloSecao({ rotulo, titulo, descricao, id, claro = false, centralizado = false }: Props) {
  return (
    <div className={centralizado ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p
        className={`inline-flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.26em] ${
          claro ? "text-prata-300" : "text-aco"
        }`}
      >
        <span className={`h-px w-8 ${claro ? "bg-prata-300/60" : "bg-aco/50"}`} aria-hidden="true" />
        {rotulo}
      </p>
      <h2
        id={id}
        className={`mt-4 font-display text-[2.15rem] font-medium leading-[1.1] tracking-[-0.005em] sm:text-5xl ${
          claro ? "text-white" : "text-navy-900"
        }`}
      >
        {titulo}
      </h2>
      {descricao && (
        <div className={`mt-5 text-lg leading-relaxed ${claro ? "text-prata-300" : "text-tinta-suave"}`}>{descricao}</div>
      )}
    </div>
  );
}
