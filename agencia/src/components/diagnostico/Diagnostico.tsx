"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Assinatura, Marca } from "@/components/diagnostico/Marca";
import { Relatorio } from "@/components/diagnostico/Relatorio";
import { PERGUNTAS, PILARES, type Respostas } from "@/lib/diagnostico";

type Etapa = "inicio" | "perguntas" | "resultado";
const LETRAS = ["A", "B", "C", "D"];

export function Diagnostico() {
  const [etapa, setEtapa] = useState<Etapa>("inicio");
  const [indice, setIndice] = useState(0);
  const [respostas, setRespostas] = useState<Respostas>({});

  const irPara = useCallback((nova: Etapa) => {
    setEtapa(nova);
    window.scrollTo({ top: 0 });
  }, []);

  const reiniciar = useCallback(() => {
    setRespostas({});
    setIndice(0);
    irPara("inicio");
  }, [irPara]);

  if (etapa === "inicio") return <Inicio onIniciar={() => irPara("perguntas")} />;
  if (etapa === "resultado") return <Relatorio respostas={respostas} onRefazer={reiniciar} />;

  return (
    <Questionario
      indice={indice}
      respostas={respostas}
      onResponder={(id, pontos) => {
        const novas = { ...respostas, [id]: pontos };
        setRespostas(novas);
        if (indice + 1 < PERGUNTAS.length) setIndice(indice + 1);
        else irPara("resultado");
      }}
      onVoltar={() => (indice === 0 ? irPara("inicio") : setIndice(indice - 1))}
    />
  );
}

/* ───────────────────────── Tela inicial ───────────────────────── */

function Inicio({ onIniciar }: { onIniciar: () => void }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[linear-gradient(180deg,#14474d_0%,#0e373e_50%,#08262e_100%)]">
      {/* Brilho sutil atrás da logo, como na arte oficial. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-10%] h-[60vh] w-[90vw] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(230,231,226,0.10),transparent)]"
      />
      <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:px-8">
        <div className="animate-surgir">
          <Marca largura={220} className="mx-auto sm:hidden" />
          <Marca largura={280} className="mx-auto hidden sm:block" />
        </div>

        <div className="mt-12 h-px w-16 bg-prata-suave/40 animate-surgir [animation-delay:120ms]" />

        <h1 className="mt-10 font-display text-[2.1rem] font-light uppercase leading-tight tracking-[0.16em] text-perola animate-surgir [animation-delay:180ms] sm:text-5xl md:text-6xl">
          Diagnóstico Operacional
        </h1>
        <p className="mt-6 max-w-2xl font-display text-xl italic leading-snug text-perola/90 animate-surgir [animation-delay:260ms] sm:text-2xl md:text-[1.7rem]">
          Descubra onde sua agência está perdendo tempo e dinheiro em apenas 2 minutos.
        </p>
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-cinza-mcx animate-surgir [animation-delay:340ms] sm:text-base">
          Uma avaliação rápida das rotinas de backoffice e dos processos operacionais da sua agência, com
          recomendações práticas para melhorar seus resultados.
        </p>

        <button
          type="button"
          onClick={onIniciar}
          className="group mt-12 inline-flex items-center gap-4 border border-perola bg-perola px-9 py-4 text-[13px] font-semibold uppercase tracking-[0.28em] text-petroleo-900 transition-colors duration-300 animate-surgir [animation-delay:420ms] hover:bg-transparent hover:text-perola focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-perola"
        >
          Iniciar diagnóstico
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
        </button>

        <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.22em] text-cinza-mcx/80 animate-surgir [animation-delay:500ms]">
          <li>{PERGUNTAS.length} perguntas</li>
          <li aria-hidden="true" className="h-3 w-px bg-white/15" />
          <li>{PILARES.length} pilares de gestão</li>
          <li aria-hidden="true" className="h-3 w-px bg-white/15" />
          <li>Relatório imediato</li>
        </ul>
        <p className="mt-4 text-xs text-cinza-mcx/70 animate-surgir [animation-delay:500ms]">
          Suas respostas ficam apenas neste aparelho.
        </p>
      </main>
      <Assinatura />
    </div>
  );
}

/* ───────────────────────── Questionário ───────────────────────── */

function Questionario({
  indice,
  respostas,
  onResponder,
  onVoltar,
}: {
  indice: number;
  respostas: Respostas;
  onResponder: (id: string, pontos: number) => void;
  onVoltar: () => void;
}) {
  const pergunta = PERGUNTAS[indice];
  const pilarIndice = PILARES.findIndex((p) => p.id === pergunta.pilar);
  const pilar = PILARES[pilarIndice];
  // Escolha visual vale só para a pergunta em que foi feita.
  const [escolhaFeita, setEscolhaFeita] = useState<{ indice: number; pontos: number } | null>(null);
  const escolha = escolhaFeita?.indice === indice ? escolhaFeita.pontos : null;
  const titulo = useRef<HTMLHeadingElement>(null);
  const travado = useRef(false);

  // Nova pergunta: libera a escolha e leva o foco ao enunciado.
  useEffect(() => {
    travado.current = false;
    titulo.current?.focus({ preventScroll: true });
  }, [indice]);

  const escolher = useCallback(
    (pontos: number) => {
      if (travado.current) return;
      travado.current = true;
      setEscolhaFeita({ indice, pontos });
      // Pequena pausa para o visitante ver a alternativa marcada.
      window.setTimeout(() => onResponder(pergunta.id, pontos), 320);
    },
    [onResponder, pergunta.id, indice],
  );

  // Atalhos: A–D ou 1–4 escolhem; seta para a esquerda volta.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const pos = "abcd".indexOf(k) >= 0 ? "abcd".indexOf(k) : "1234".indexOf(k);
      if (pos >= 0 && k.length === 1) escolher(pergunta.alternativas[pos].pontos);
      else if (e.key === "ArrowLeft") onVoltar();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [escolher, onVoltar, pergunta]);

  const marcada = escolha ?? respostas[pergunta.id] ?? null;
  const progresso = Math.round((indice / PERGUNTAS.length) * 100);

  return (
    <div className="flex min-h-dvh flex-col bg-[linear-gradient(180deg,#103f42_0%,#0b3033_45%,#08262e_100%)]">
      <header className="border-b border-white/8">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-4">
            <Image src="/diagnostico/monograma-prata.png" alt="MCX" width={480} height={282} className="h-7 w-auto" />
            <span className="hidden h-5 w-px bg-white/15 sm:block" aria-hidden="true" />
            <span className="hidden text-[11px] uppercase tracking-[0.3em] text-cinza-mcx sm:block">
              Diagnóstico Operacional
            </span>
          </div>
          <p className="font-display text-lg text-perola tabular-nums lining-nums" aria-live="polite">
            <span className="sr-only">Pergunta </span>
            {String(indice + 1).padStart(2, "0")}
            <span className="text-cinza-mcx"> / {PERGUNTAS.length}</span>
          </p>
        </div>
        <div
          className="h-[2px] bg-white/8"
          role="progressbar"
          aria-label="Progresso do diagnóstico"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progresso}
        >
          <div className="h-full bg-perola transition-[width] duration-500 ease-out" style={{ width: `${progresso}%` }} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pb-12 pt-10 sm:px-8 sm:pt-16">
        {/* Pilares: o atual em destaque, os concluídos preenchidos. */}
        <ol className="grid grid-cols-6 gap-1.5" aria-label="Pilares avaliados">
          {PILARES.map((p, i) => (
            <li key={p.id} className="min-w-0">
              <div
                className={`h-[3px] transition-colors duration-500 ${
                  i < pilarIndice ? "bg-prata-suave/70" : i === pilarIndice ? "bg-perola" : "bg-white/10"
                }`}
              />
              <span
                className={`mt-2 hidden truncate text-[10px] uppercase tracking-[0.18em] md:block ${
                  i === pilarIndice ? "text-perola" : "text-cinza-mcx/60"
                }`}
              >
                {p.rotulo}
              </span>
            </li>
          ))}
        </ol>

        <div key={pergunta.id} className="mt-12 animate-surgir sm:mt-16">
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-cinza-mcx">
            Pilar {pilarIndice + 1} de {PILARES.length} · {pilar.nome}
          </p>
          <h1
            ref={titulo}
            tabIndex={-1}
            className="mt-5 font-display text-[1.9rem] font-normal leading-[1.15] text-perola outline-none sm:text-[2.6rem]"
          >
            {pergunta.enunciado}
          </h1>

          <div className="mt-10 grid gap-3" role="group" aria-label="Alternativas">
            {pergunta.alternativas.map((a, i) => {
              const ativa = marcada === a.pontos;
              return (
                <button
                  key={a.pontos}
                  type="button"
                  aria-pressed={ativa}
                  onClick={() => escolher(a.pontos)}
                  className={`group flex w-full items-center gap-5 border px-5 py-4 text-left transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-perola sm:px-6 sm:py-5 ${
                    ativa
                      ? "border-perola bg-perola text-petroleo-900"
                      : "border-white/12 bg-white/[0.025] text-perola hover:border-white/35 hover:bg-white/[0.06]"
                  }`}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full border font-display text-base transition-colors ${
                      ativa
                        ? "border-petroleo-900/40 text-petroleo-900"
                        : "border-white/20 text-cinza-mcx group-hover:border-white/45 group-hover:text-perola"
                    }`}
                  >
                    {LETRAS[i]}
                  </span>
                  <span className="text-[15px] leading-snug sm:text-base">{a.texto}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={onVoltar}
            className="inline-flex items-center gap-2 text-cinza-mcx transition-colors hover:text-perola focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-perola"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Voltar
          </button>
          <p className="hidden text-xs text-cinza-mcx/60 sm:block">Use as teclas A, B, C ou D para responder</p>
        </div>
      </main>
      <Assinatura />
    </div>
  );
}
