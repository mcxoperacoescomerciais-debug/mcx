import Image from "next/image";
import { MARCA } from "@/lib/diagnostico";

/**
 * Logo oficial MCX Soluções Operacionais, sem redesenho: a versão prata é o
 * arquivo original; a versão petróleo só troca a cor do traço para fundos
 * claros. `comNome={false}` mostra apenas o monograma (recorte do original).
 */
export function Marca({
  tom = "claro",
  largura = 240,
  comNome = true,
  className = "",
}: {
  tom?: "claro" | "escuro";
  largura?: number;
  comNome?: boolean;
  className?: string;
}) {
  const cor = tom === "claro" ? "prata" : "petroleo";
  const src = comNome ? `/diagnostico/logo-${cor}.png` : `/diagnostico/monograma-${cor}.png`;
  return (
    <Image
      src={src}
      alt={MARCA.nome}
      width={480}
      height={comNome ? 402 : 282}
      priority
      className={`h-auto ${className}`}
      style={{ width: largura }}
    />
  );
}

/** Assinatura institucional usada no rodapé de todas as telas. */
export function Assinatura({ tom = "claro" }: { tom?: "claro" | "escuro" }) {
  const claro = tom === "claro";
  return (
    <footer className={`border-t ${claro ? "border-white/10" : "border-petroleo-900/15"}`}>
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-8 text-center sm:px-8">
        <p
          className={`text-[11px] font-medium uppercase tracking-[0.42em] ${claro ? "text-perola" : "text-petroleo-900"}`}
        >
          {MARCA.nome}
        </p>
        <p className={`font-display text-lg italic ${claro ? "text-cinza-mcx" : "text-grafite"}`}>{MARCA.assinatura}</p>
      </div>
    </footer>
  );
}
