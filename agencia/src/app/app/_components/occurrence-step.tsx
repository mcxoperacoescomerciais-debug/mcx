"use client";

import { useState } from "react";
import { MessageSquareWarning, Plus, Trash2 } from "lucide-react";
import { Button, StatusBadge } from "@/components/ui";
import { OCCURRENCE_CATEGORIES, OCCURRENCE_CATEGORY_LABEL, type OccurrenceCategory } from "@/lib/domain";
import type { BootstrapBrand } from "@/lib/sync-types";
import { deleteOccurrence, saveOccurrence, uuid, type LocalAttendance } from "../_lib/local-store";
import { haptic } from "../_lib/hooks";
import { Chip, Sheet, TextArea, toast } from "./primitives";
import { PhotoCapture } from "./photo-capture";

/** Opcional: não há obrigação de registrar ocorrência quando não houver nenhuma. */
export function OccurrenceStep({ visitId, attendance, brand, editable }: { visitId: string; attendance: LocalAttendance; brand: BootstrapBrand; editable: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const list = Object.values(attendance.occurrences);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-2">Observações e ocorrências</h2>
        <span className="text-[12px] text-muted">Opcional</span>
      </div>
      <p className="text-[13px] text-muted mb-3">Use para o que não é estoque nem ruptura: falta de espaço, material ausente, exposição com problema… Se não houve nada, siga em frente.</p>
      <div className="space-y-2">
        {list.map((o) => {
          const photos = attendance.photos.filter((p) => p.occurrenceId === o.id).length;
          return (
            <div key={o.id} className="bg-surface border border-line rounded-2xl p-4 flex gap-3">
              <MessageSquareWarning className="size-5 text-warn shrink-0 mt-0.5" />
              <button type="button" disabled={!editable} onClick={() => setEditing(o.id)} className="flex-1 min-w-0 text-left">
                <p className="font-semibold text-[15px]">{OCCURRENCE_CATEGORY_LABEL[o.category]}</p>
                {o.note ? <p className="text-[13px] text-ink-2 mt-0.5">“{o.note}”</p> : null}
                {photos ? <StatusBadge tone="success" size="sm" className="mt-1.5">{photos} foto(s)</StatusBadge> : null}
              </button>
              {editable ? (
                <button type="button" aria-label="Excluir" onClick={() => void deleteOccurrence(visitId, attendance.id, o.id)} className="size-10 grid place-items-center text-bad">
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {editable ? (
        <Button size="lg" variant="secondary" className="w-full mt-3" onClick={() => setEditing("new")}>
          <Plus className="size-5" /> Registrar ocorrência
        </Button>
      ) : list.length === 0 ? (
        <p className="text-[14px] text-muted bg-surface border border-line rounded-2xl p-4">Nenhuma ocorrência registrada.</p>
      ) : null}

      {editing ? <OccurrenceSheet visitId={visitId} attendance={attendance} brand={brand} occurrenceId={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function OccurrenceSheet({ visitId, attendance, brand, occurrenceId, onClose }: { visitId: string; attendance: LocalAttendance; brand: BootstrapBrand; occurrenceId: string | null; onClose: () => void }) {
  const current = occurrenceId ? attendance.occurrences[occurrenceId] : undefined;
  const [id] = useState(occurrenceId ?? uuid());
  const [category, setCategory] = useState<OccurrenceCategory | null>(current?.category ?? null);
  const [note, setNote] = useState(current?.note ?? "");
  const saved = Boolean(attendance.occurrences[id]);

  async function save(close: boolean) {
    if (!category) return;
    await saveOccurrence(visitId, attendance.id, { id, category, note: note.trim() || null, recordedAt: current?.recordedAt ?? new Date().toISOString() });
    haptic(15);
    if (close) {
      toast("Ocorrência registrada.");
      onClose();
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={current ? "Editar ocorrência" : "Nova ocorrência"}
      footer={
        <Button size="xl" className="w-full" disabled={!category} onClick={() => void save(true)}>
          Salvar ocorrência
        </Button>
      }
    >
      <p className="text-[13px] font-semibold text-ink-2 mb-2">Categoria</p>
      <div className="grid grid-cols-1 gap-2">
        {OCCURRENCE_CATEGORIES.map((c) => (
          <Chip key={c} selected={category === c} onClick={() => setCategory(c)}>
            {OCCURRENCE_CATEGORY_LABEL[c]}
          </Chip>
        ))}
      </div>
      <div className="mt-4">
        <TextArea label="Observação curta" value={note} onChange={setNote} placeholder="O que aconteceu?" rows={2} />
      </div>
      <div className="mt-4">
        {saved ? (
          <PhotoCapture
            visitId={visitId}
            attendanceId={attendance.id}
            kind="occurrence"
            photos={attendance.photos.filter((p) => p.occurrenceId === id)}
            min={0}
            allowGallery={brand.allowGallery}
            editable
            title="Foto (opcional)"
            cta="Fotografar"
            link={{ occurrenceId: id }}
            compact
          />
        ) : category ? (
          <button type="button" onClick={() => void save(false)} className="text-[14px] font-semibold text-brand-700">
            + Anexar foto
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
