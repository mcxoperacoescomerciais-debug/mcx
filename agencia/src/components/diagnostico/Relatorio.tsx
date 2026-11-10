"use client";

import { ArrowRight, Printer, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { Assinatura, Marca } from "@/components/diagnostico/Marca";
import {
  MARCA,
  calcularResultado,
  formatarNota,
  linkWhatsAppResultado,
  type ResultadoPilar,
  type Respostas,
} from "@/lib/diagnostico";

const ROMANOS = ["I", "II", "III"];

export function Relatorio({ respostas, onRefazer }: { respostas: Respostas; onRefazer: () => void }) {
  const r = useMemo(() => calcularResultado(respostas), [respostas]);
  const data = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const whatsapp = linkWhatsAppResultado(r);

  return (
    <div className="bg-perola-claro text-petroleo-950">
      {/* ── Capa do relatório ── */}
      <section className="bg-[linear-gradient(180deg,#14474d_0%,#0e373e_55%,#08262e_100%)] text-perola">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-8 sm:pb-20">
          <div className="flex items-start justify-between gap-6 border-b border-white/10 pb-6">
            <Marca largura={120} />
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-[0.3em] text-cinza-mcx">Relatório</p>
              <p className="mt-1 font-display text-lg text-perola">Diagnóstico Operacional</p>
              <p className="mt-1 text-xs text-cinza-mcx">{data}</p>
            </div>
          </div>

          <div className="mt-14 grid items-center gap-12 md:grid-cols-[auto_1fr] md:gap-16">
            <Medidor nota={r.nota} />
            <div className="animate-surgir [animation-delay:150ms]">
              <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-cinza-mcx">Nível de maturidade</p>
              <h1 className="mt-3 font-display text-4xl font-normal leading-tight sm:text-5xl">{r.nivel.titulo}</h1>
              <p className="mt-5 max-w-xl leading-relaxed text-prata-suave">{r.nivel.resumo}</p>
              <dl className="mt-8 grid max-w-xl grid-cols-3 border-t border-white/10 pt-6">
                {r.gargalos.map((g, i) => (
                  <div key={g.id} className={i > 0 ? "border-l border-white/10 pl-4" : ""}>
                    <dt className="text-[10px] uppercase tracking-[0.2em] text-cinza-mcx">Gargalo {ROMANOS[i]}</dt>
                    <dd className="mt-1.5 font-display text-lg leading-tight text-perola">{g.rotulo}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 sm:px-8">
        {/* ── 01 Desempenho por pilar ── */}
        <Secao numero="01" titulo="Desempenho dos seis pilares" subtitulo="Percentual de maturidade em cada área da gestão.">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            <Radar pilares={r.pilares} />
            <ul className="space-y-5">
              {r.pilares.map((p) => {
                const gargalo = r.gargalos.some((g) => g.id === p.id);
                return (
                  <li key={p.id}>
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-[15px] font-medium text-petroleo-900">
                        {p.nome}
                        {gargalo && (
                          <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-[0.18em] text-petroleo-500">
                            Gargalo
                          </span>
                        )}
                      </span>
                      <span className="font-display text-xl tabular-nums lining-nums text-petroleo-900">{p.percentual}%</span>
                    </div>
                    <div className="mt-2 h-[5px] bg-petroleo-900/8">
                      <div
                        className={`h-full ${gargalo ? "bg-petroleo-500" : "bg-petroleo-800"}`}
                        style={{ width: `${Math.max(p.percentual, 1.5)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </Secao>

        {/* ── 02 Gargalos ── */}
        <Secao
          numero="02"
          titulo="Três principais gargalos"
          subtitulo="Onde a agência mais perde tempo e dinheiro hoje, em ordem de prioridade."
        >
          <div className="grid gap-5 lg:grid-cols-3">
            {r.gargalos.map((g, i) => (
              <article key={g.id} className="diag-bloco flex flex-col border border-petroleo-900/12 bg-white p-6 sm:p-7">
                <div className="flex items-start justify-between">
                  <span className="font-display text-4xl font-light leading-none text-petroleo-500">{ROMANOS[i]}</span>
                  <span className="border border-petroleo-900/15 px-2.5 py-1 font-display text-base tabular-nums lining-nums text-petroleo-900">
                    {g.percentual}%
                  </span>
                </div>
                <h3 className="mt-6 font-display text-2xl leading-tight text-petroleo-950">{g.nome}</h3>
                <p className="mt-3 text-[14px] leading-relaxed text-grafite">{g.impacto}</p>
                {g.achados.length > 0 && (
                  <div className="mt-5 border-t border-petroleo-900/10 pt-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-petroleo-500">
                      O que suas respostas indicam
                    </p>
                    <ul className="mt-3 space-y-2.5">
                      {g.achados.map((a) => (
                        <li key={a} className="flex gap-3 text-[14px] leading-snug text-petroleo-900">
                          <span className="mt-[0.55em] h-px w-3 shrink-0 bg-petroleo-500" aria-hidden="true" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
          </div>
        </Secao>

        {/* ── 03 Recomendações ── */}
        <Secao
          numero="03"
          titulo="Recomendações práticas"
          subtitulo="Medidas ajustadas ao nível atual de cada gargalo, prontas para começar."
        >
          <div className="divide-y divide-petroleo-900/10 border-y border-petroleo-900/10">
            {r.gargalos.map((g, i) => (
              <div key={g.id} className="diag-bloco grid gap-4 py-7 md:grid-cols-[220px_1fr] md:gap-10">
                <p className="font-display text-xl text-petroleo-900">
                  <span className="mr-3 text-petroleo-500">{ROMANOS[i]}</span>
                  {g.nome}
                </p>
                <ol className="space-y-3">
                  {g.recomendacoesAplicaveis.map((rec) => (
                    <li key={rec} className="flex gap-3 leading-relaxed text-petroleo-950">
                      <ArrowRight className="mt-1 size-4 shrink-0 text-petroleo-500" aria-hidden="true" />
                      {rec}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Secao>

        {/* ── 04 Plano de 30 dias ── */}
        <Secao
          numero="04"
          titulo="Plano de ação de 30 dias"
          subtitulo="Sequência sugerida para atacar os gargalos sem parar a operação."
        >
          <ol className="grid gap-px overflow-hidden border border-petroleo-900/12 bg-petroleo-900/12 md:grid-cols-2 lg:grid-cols-4">
            {r.plano.map((etapa, i) => (
              <li key={etapa.semana} className="diag-bloco flex flex-col bg-white p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-petroleo-900 font-display text-sm text-perola">
                    {i + 1}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-petroleo-500">
                    {etapa.semana}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-xl leading-tight text-petroleo-950">{etapa.foco}</h3>
                <ul className="mt-4 space-y-3">
                  {etapa.acoes.map((a) => (
                    <li key={a} className="border-l border-petroleo-500/40 pl-3 text-[14px] leading-snug text-grafite">
                      {a}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </Secao>
      </main>

      {/* ── Próximo passo ── */}
      <section className="mt-20 bg-petroleo-900 text-perola">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-8 md:grid-cols-[1.3fr_1fr] md:items-center">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-cinza-mcx">Próximo passo</p>
            <h2 className="mt-4 font-display text-3xl leading-tight sm:text-4xl">
              Um parceiro estratégico para colocar este plano em prática.
            </h2>
            <p className="mt-5 max-w-xl leading-relaxed text-prata-suave">
              A {MARCA.nome} assume e estrutura o backoffice da sua agência — rotinas administrativas, controle de
              demandas, acompanhamento do campo e relatórios aos clientes — para que a gestão ganhe método,
              previsibilidade e tempo para crescer.
            </p>
          </div>
          <div className="diag-sem-impressao flex flex-col gap-3">
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-3 border border-perola bg-perola px-6 py-4 text-[12px] font-semibold uppercase tracking-[0.24em] text-petroleo-900 transition-colors hover:bg-transparent hover:text-perola"
              >
                Conversar com a MCX
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className={`inline-flex items-center justify-center gap-3 border px-6 py-4 text-[12px] font-semibold uppercase tracking-[0.24em] transition-colors ${
                whatsapp
                  ? "border-white/25 text-perola hover:border-perola"
                  : "border-perola bg-perola text-petroleo-900 hover:bg-transparent hover:text-perola"
              }`}
            >
              <Printer className="size-4" aria-hidden="true" />
              Salvar relatório em PDF
            </button>
            <button
              type="button"
              onClick={onRefazer}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm text-cinza-mcx transition-colors hover:text-perola"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Refazer o diagnóstico
            </button>
          </div>
        </div>
        <Assinatura />
      </section>
    </div>
  );
}

function Secao({
  numero,
  titulo,
  subtitulo,
  children,
}: {
  numero: string;
  titulo: string;
  subtitulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pt-16 sm:pt-20">
      <header className="diag-bloco mb-10 grid gap-2 border-b border-petroleo-900/12 pb-6 sm:grid-cols-[72px_1fr] sm:gap-6">
        <span className="font-display text-3xl font-light text-petroleo-500">{numero}</span>
        <div>
          <h2 className="font-display text-3xl leading-tight text-petroleo-950 sm:text-[2.4rem]">{titulo}</h2>
          <p className="mt-2 text-[15px] text-grafite">{subtitulo}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

/** Nota em destaque, com arco proporcional de 0 a 10. */
function Medidor({ nota }: { nota: number }) {
  const raio = 92;
  const circ = 2 * Math.PI * raio;
  return (
    <div className="relative mx-auto size-[220px] animate-surgir sm:size-[240px]">
      <svg viewBox="0 0 220 220" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="110" cy="110" r={raio} fill="none" stroke="rgba(230,231,226,0.12)" strokeWidth="2" />
        <circle
          cx="110"
          cy="110"
          r={raio}
          fill="none"
          stroke="#e6e7e2"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${(nota / 10) * circ} ${circ}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] uppercase tracking-[0.3em] text-cinza-mcx">Nota operacional</span>
        <span className="mt-1 font-display text-7xl font-light leading-none tabular-nums lining-nums text-perola">
          {formatarNota(nota)}
        </span>
        <span className="mt-2 font-display text-lg text-cinza-mcx">de 10</span>
      </div>
    </div>
  );
}

/** Gráfico de radar dos seis pilares (SVG puro, legível impresso). */
function Radar({ pilares }: { pilares: ResultadoPilar[] }) {
  const c = 200;
  const R = 112;
  const n = pilares.length;
  const ponto = (i: number, frac: number) => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [c + Math.cos(ang) * R * frac, c + Math.sin(ang) * R * frac] as const;
  };
  const poligono = (fracs: number[]) => fracs.map((f, i) => ponto(i, f).join(",")).join(" ");

  return (
    <figure className="diag-bloco mx-auto w-full max-w-[520px]">
      <svg viewBox="-72 10 544 380" className="w-full overflow-visible" role="img" aria-labelledby="radar-titulo">
        <title id="radar-titulo">
          {`Desempenho por pilar: ${pilares.map((p) => `${p.nome} ${p.percentual}%`).join(", ")}`}
        </title>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon
            key={f}
            points={poligono(pilares.map(() => f))}
            fill="none"
            stroke="#0b3033"
            strokeOpacity={f === 1 ? 0.22 : 0.1}
          />
        ))}
        {pilares.map((p, i) => {
          const [x, y] = ponto(i, 1);
          return <line key={p.id} x1={c} y1={c} x2={x} y2={y} stroke="#0b3033" strokeOpacity="0.1" />;
        })}
        <polygon
          points={poligono(pilares.map((p) => Math.max(p.percentual, 3) / 100))}
          fill="#103f42"
          fillOpacity="0.16"
          stroke="#103f42"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        {pilares.map((p, i) => {
          const [x, y] = ponto(i, Math.max(p.percentual, 3) / 100);
          return <circle key={p.id} cx={x} cy={y} r="3.5" fill="#0b3033" />;
        })}
        {pilares.map((p, i) => {
          const [x, y] = ponto(i, 1.2);
          const ancora = Math.abs(x - c) < 4 ? "middle" : x > c ? "start" : "end";
          return (
            <text key={p.id} x={x} y={y} textAnchor={ancora} dominantBaseline="middle">
              <tspan x={x} dy="-0.45em" fontSize="12.5" letterSpacing="1" fill="#4a5654" style={{ textTransform: "uppercase" }}>
                {p.rotulo}
              </tspan>
              <tspan x={x} dy="1.35em" fontSize="19" fill="#0b3033" fontFamily="var(--font-display)" style={{ fontVariantNumeric: "lining-nums" }}>
                {p.percentual}%
              </tspan>
            </text>
          );
        })}
      </svg>
    </figure>
  );
}
