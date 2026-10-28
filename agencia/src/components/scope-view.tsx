/**
 * Partes visuais do escopo de serviços (página pública do cliente e
 * visualização da resposta no painel MCX). Identidade da MCX: azul-marinho e prata.
 */
import { CheckCircle2, MessageSquareWarning } from "lucide-react";
import { fmtDateTime } from "@/lib/dates";
import { countAnswers, SCOPE_CHOICE_LABEL, type ScopeAnswer, type ScopeChoice } from "@/lib/scope-forms";
import { PrintButton } from "./print-button";

const CHOICE_BADGE: Record<ScopeChoice, string> = {
  ok: "bg-[#e3f4ea] text-[#1a7f4b]",
  reservation: "bg-[#fdf0dc] text-[#9a5b00]",
  declined: "bg-[#fdeeed] text-[#b42318]",
};

export function ScopeHeader({ siteUrl }: { siteUrl: string | null }) {
  return (
    <header className="bg-[#000D36] print:bg-white">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:h-[72px] sm:px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mcx-logo-prata.png" alt="MCX Soluções Operacionais" width={480} height={402} className="h-11 w-auto print:invert" />
        {siteUrl ? (
          <a
            href={siteUrl}
            className="rounded-full border border-white/25 px-4 py-2 text-[13px] font-semibold text-white transition hover:border-white hover:bg-white/10 print:hidden"
          >
            Institucional
          </a>
        ) : null}
      </div>
    </header>
  );
}

export function ScopeIntro({ clientName, title, intro, details }: { clientName: string; title: string; intro: string | null; details: string | null }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#5b6b8c]">Preparado para {clientName}</p>
      <h1 className="mt-3 text-[1.75rem] font-semibold leading-tight text-[#000D36] sm:text-[2.1rem]">{title}</h1>
      {intro ? <p className="mt-4 whitespace-pre-line text-[16px] leading-relaxed text-[#3d4a66]">{intro}</p> : null}
      {details ? (
        <p className="mt-4 whitespace-pre-line rounded-2xl border border-[#d9dde6] bg-white px-4 py-3 text-[15px] leading-relaxed text-[#3d4a66]">{details}</p>
      ) : null}
    </div>
  );
}

type ResponseView = {
  answers: ScopeAnswer[];
  generalNote: string | null;
  signerName: string;
  signerRole: string;
  signerEmail: string | null;
  submittedAt: Date;
  snapshot: { closingText: string | null };
};

/** Resposta confirmada, agrupada por seção, com as ressalvas em destaque. */
export function ScopeSummary({ response, showPrint = true }: { response: ResponseView; showPrint?: boolean }) {
  const c = countAnswers(response.answers);
  const sections: { title: string; items: ScopeAnswer[] }[] = [];
  for (const a of response.answers) {
    const last = sections[sections.length - 1];
    if (last && last.title === a.section) last.items.push(a);
    else sections.push({ title: a.section, items: [a] });
  }
  return (
    <div className="mt-8 space-y-5">
      <div className="rounded-2xl bg-[#000D36] p-5 text-white sm:p-6 print:border print:border-[#000D36] print:bg-white print:text-[#000D36]">
        <p className="flex items-center gap-2 text-[17px] font-semibold">
          <CheckCircle2 className="size-5 text-[#9fe0b8] print:text-[#1a7f4b]" aria-hidden="true" /> Escopo confirmado
        </p>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[#c9cfdb] print:text-[#3d4a66]">
          Por {response.signerName} ({response.signerRole}){response.signerEmail ? ` · ${response.signerEmail}` : ""} em {fmtDateTime(response.submittedAt)}.
          <br />
          {c.ok} item(ns) de acordo · {c.reservations} com ressalva · {c.declined} não de acordo{c.questions ? ` · ${c.questions} pergunta(s)` : ""}.
        </p>
        {showPrint ? <PrintButton className="mt-4" /> : null}
      </div>

      {sections.map((sec, si) => (
        <section key={`${si}-${sec.title}`} className="break-inside-avoid-page rounded-2xl border border-[#d9dde6] bg-white p-5 sm:p-6">
          <h2 className="text-[16px] font-semibold text-[#000D36]">
            {si + 1}. {sec.title}
          </h2>
          <ul className="mt-3 divide-y divide-[#eceef3]">
            {sec.items.map((a) => (
              <li key={a.itemId} className="py-2.5 text-[14.5px] leading-relaxed">
                <div className="flex items-start gap-3">
                  {a.kind === "questions" || !a.choice ? null : (
                    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${CHOICE_BADGE[a.choice]}`}>{SCOPE_CHOICE_LABEL[a.choice]}</span>
                  )}
                  <span className="text-[#16203a]">{a.text}</span>
                </div>
                {a.note ? (
                  <p
                    className={`mt-1.5 whitespace-pre-line rounded-xl px-3 py-2 text-[14px] ${
                      a.kind === "questions" ? "bg-[#f1f3f8] text-[#16203a]" : a.choice === "declined" ? "bg-[#fdeeed] text-[#7a1a12]" : "bg-[#fdf6ea] text-[#5c3d00]"
                    }`}
                  >
                    {a.kind === "questions" ? null : <MessageSquareWarning className="mr-1.5 inline size-4 align-[-3px]" aria-hidden="true" />}
                    {a.note}
                  </p>
                ) : a.kind === "questions" ? (
                  <p className="mt-1 text-[13.5px] italic text-[#7a869e]">Sem resposta.</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {response.generalNote ? (
        <section className="rounded-2xl border border-[#d9dde6] bg-white p-5 sm:p-6">
          <h2 className="text-[16px] font-semibold text-[#000D36]">Observações gerais</h2>
          <p className="mt-2 whitespace-pre-line text-[14.5px] leading-relaxed">{response.generalNote}</p>
        </section>
      ) : null}
    </div>
  );
}
