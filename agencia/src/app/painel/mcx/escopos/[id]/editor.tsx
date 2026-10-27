"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { buttonClass, inputClass, selectClass } from "@/components/ui";
import { itemsFromLines, LIMITS, SECTION_KIND_LABEL, type ScopeSection, type ScopeSectionKind } from "@/lib/scope-forms";
import { ActionForm } from "../../../_components/action-form";
import { saveScopeAction } from "../actions";

type EditableSection = { key: number; title: string; kind: ScopeSectionKind; lines: string };

type Initial = { id: string; clientName: string; title: string; intro: string | null; details: string | null; closingText: string | null; sections: ScopeSection[] };

const area = inputClass + " !h-auto py-2 leading-relaxed";
let nextKey = 1;

/** Editor do escopo: cada seção tem título, tipo e um item por linha. */
export function ScopeEditor({ initial }: { initial: Initial }) {
  const [sections, setSections] = useState<EditableSection[]>(() =>
    initial.sections.map((s) => ({ key: nextKey++, title: s.title, kind: s.kind, lines: s.items.map((i) => i.text).join("\n") })),
  );

  const update = (key: number, patch: Partial<EditableSection>) => setSections((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = (index: number, delta: number) =>
    setSections((all) => {
      const to = index + delta;
      if (to < 0 || to >= all.length) return all;
      const copy = [...all];
      [copy[index], copy[to]] = [copy[to], copy[index]];
      return copy;
    });
  const remove = (key: number) => setSections((all) => all.filter((s) => s.key !== key));
  const add = () => setSections((all) => [...all, { key: nextKey++, title: "", kind: "checklist", lines: "" }]);

  const payload = JSON.stringify(sections.map((s) => ({ title: s.title, kind: s.kind, items: itemsFromLines(s.lines) })));
  const totalItems = sections.reduce((n, s) => n + itemsFromLines(s.lines).length, 0);

  return (
    <ActionForm action={saveScopeAction} hidden={{ id: initial.id, sections: payload }} submitLabel="Salvar escopo" resetOnSuccess={false} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[13px] font-semibold text-ink-2">Cliente</span>
          <input name="clientName" required maxLength={LIMITS.name} defaultValue={initial.clientName} className={inputClass + " mt-1"} />
        </label>
        <label className="block">
          <span className="text-[13px] font-semibold text-ink-2">Título</span>
          <input name="title" required maxLength={LIMITS.title} defaultValue={initial.title} className={inputClass + " mt-1"} />
        </label>
      </div>
      <label className="block">
        <span className="text-[13px] font-semibold text-ink-2">Introdução</span>
        <textarea name="intro" rows={2} maxLength={LIMITS.longText} defaultValue={initial.intro ?? ""} className={area + " mt-1"} placeholder="Ex.: Objetivo: detalhar as atividades previstas..." />
      </label>
      <label className="block">
        <span className="text-[13px] font-semibold text-ink-2">Destaque (opcional)</span>
        <textarea name="details" rows={2} maxLength={LIMITS.longText} defaultValue={initial.details ?? ""} className={area + " mt-1"} placeholder="Ex.: Estrutura inicial considerada: até 2 promotores..." />
        <span className="mt-1 block text-xs text-muted">Aparece em um quadro logo abaixo da introdução.</span>
      </label>

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">Seções</h3>
            <p className="text-[12.5px] text-muted">
              {sections.length} seção(ões) · {totalItems} item(ns). Escreva um item por linha; marcadores como ☐, - ou 1. são removidos.
            </p>
          </div>
        </div>
        {sections.map((s, i) => (
          <fieldset key={s.key} className="rounded-xl border border-line bg-subtle/50 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-center text-[13px] font-semibold text-muted">{i + 1}.</span>
              <input
                value={s.title}
                onChange={(e) => update(s.key, { title: e.target.value })}
                maxLength={LIMITS.title}
                placeholder="Título da seção"
                aria-label={`Título da seção ${i + 1}`}
                className={inputClass + " min-w-0 flex-1 basis-56"}
              />
              <select
                value={s.kind}
                onChange={(e) => update(s.key, { kind: e.target.value as ScopeSectionKind })}
                aria-label={`Tipo da seção ${i + 1}`}
                className={selectClass + " !w-auto"}
              >
                {(Object.keys(SECTION_KIND_LABEL) as ScopeSectionKind[]).map((k) => (
                  <option key={k} value={k}>
                    {SECTION_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              <div className="flex gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={buttonClass("ghost", "sm")} aria-label="Subir seção">
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === sections.length - 1} className={buttonClass("ghost", "sm")} aria-label="Descer seção">
                  <ArrowDown className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => (s.lines.trim() && !confirm("Remover esta seção e os itens dela?") ? null : remove(s.key))}
                  className={buttonClass("ghost", "sm", "text-bad")}
                  aria-label="Remover seção"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
            <textarea
              value={s.lines}
              onChange={(e) => update(s.key, { lines: e.target.value })}
              rows={Math.min(14, Math.max(3, s.lines.split("\n").length + 1))}
              placeholder={s.kind === "questions" ? "Uma pergunta por linha" : "Um item por linha"}
              aria-label={`Itens da seção ${i + 1}`}
              className={area + " mt-2.5"}
            />
            <p className="mt-1 text-xs text-muted">
              {s.kind === "questions" ? "O cliente responde cada pergunta por escrito (opcional para ele)." : "O cliente marca De acordo ou Ressalva em cada item (obrigatório)."}
            </p>
          </fieldset>
        ))}
        <button type="button" onClick={add} className={buttonClass("secondary", "md")}>
          <Plus className="size-4" /> Adicionar seção
        </button>
      </div>

      <label className="block">
        <span className="text-[13px] font-semibold text-ink-2">Texto da validação (antes do aceite)</span>
        <textarea name="closingText" rows={3} maxLength={LIMITS.longText} defaultValue={initial.closingText ?? ""} className={area + " mt-1"} />
        <span className="mt-1 block text-xs text-muted">No fim, o cliente informa nome, cargo e e-mail (opcional) e confirma o escopo.</span>
      </label>
    </ActionForm>
  );
}
