import { Cabecalho } from "@/components/Cabecalho";
import { Rodape } from "@/components/Rodape";
import { ComoFunciona } from "@/components/secoes/ComoFunciona";
import { Contato } from "@/components/secoes/Contato";
import { Diferenciais } from "@/components/secoes/Diferenciais";
import { Hero } from "@/components/secoes/Hero";
import { ParaQuem } from "@/components/secoes/ParaQuem";
import { Solucoes } from "@/components/secoes/Solucoes";
import { Sobre } from "@/components/secoes/Sobre";

export default function Inicio() {
  return (
    <>
      <Cabecalho />
      <main id="conteudo" tabIndex={-1} className="outline-none">
        <Hero />
        <Sobre />
        <Solucoes />
        <ParaQuem />
        <Diferenciais />
        <ComoFunciona />
        <Contato />
      </main>
      <Rodape />
    </>
  );
}
