"use client";

/**
 * Perfil do usuário: ao escolher, confirma num pop-up e, para Gestor/Supervisor,
 * abre a lista de todos os painéis do sistema para marcar o que ele acessa.
 * Gestor da agência vem com tudo marcado; Supervisor, nada (marca-se à mão);
 * Promotor só usa o app de atendimento.
 */
import { useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import clsx from "clsx";
import { buttonClass } from "@/components/ui";
import type { Role } from "@/lib/domain";
import { AGENCY_ROLE_LABEL, defaultPermissions, panelsForRole, type Panel } from "@/lib/permissions";

const HELP: Record<Role, string> = {
  admin: "Todos os painéis de gestão da agência (pode tirar algum).",
  manager: "Você escolhe, um a um, os painéis que ele acessa.",
  promoter: "Só o app de atendimento das marcas. Sem painel de gestão.",
};

export function RolePicker({ initialRole, initialPermissions, isNew }: { initialRole: Role; initialPermissions: string[] | null; isNew: boolean }) {
  const [role, setRole] = useState<Role>(initialRole);
  const [perms, setPerms] = useState<string[]>(() => initialPermissions ?? panelsForRole(initialRole).map((p) => p.key));
  const [touched, setTouched] = useState(isNew);
  const [confirming, setConfirming] = useState<Role | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);

  function choose(r: Role) {
    if (r === role && !isNew) {
      if (r !== "promoter") openEditor(r, perms);
      return;
    }
    setConfirming(r);
  }
  function openEditor(r: Role, current: string[]) {
    setDraft(current);
    setEditing(true);
    setRole(r);
  }

  return (
    <div>
      <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Perfil</span>
      <input type="hidden" name="role" value={role} />
      {touched || role !== "promoter" ? <input type="hidden" name="permissionsSet" value="1" /> : null}
      {role !== "promoter" ? perms.map((p) => <input key={p} type="hidden" name="permissions" value={p} />) : null}
      <div className="grid sm:grid-cols-3 gap-2">
        {(["admin", "manager", "promoter"] as Role[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => choose(r)}
            className={clsx("text-left rounded-xl border-2 px-3 py-2.5", role === r ? "border-brand-700 bg-brand-50" : "border-line-strong bg-surface hover:bg-subtle")}
          >
            <span className="flex items-center gap-1.5 font-semibold text-[13.5px]">
              {role === r ? <Check className="size-4 text-brand-700" /> : null}
              {AGENCY_ROLE_LABEL[r]}
            </span>
            <span className="block text-[11.5px] text-muted mt-0.5 leading-snug">{HELP[r]}</span>
          </button>
        ))}
      </div>
      {role !== "promoter" ? (
        <p className="text-[12px] text-ink-2 mt-2">
          {perms.length} de {panelsForRole(role).length} painéis liberados ·{" "}
          <button type="button" onClick={() => openEditor(role, perms)} className="font-semibold text-brand-700 hover:underline">
            ver e alterar acessos
          </button>
        </p>
      ) : null}

      {confirming ? (
        <Dialog onClose={() => setConfirming(null)} title="Confirmar perfil">
          <p className="text-[14px] text-ink-2">
            Você está definindo o perfil <strong>{AGENCY_ROLE_LABEL[confirming]}</strong> para este usuário.
          </p>
          <p className="text-[13px] text-muted mt-1">{HELP[confirming]}</p>
          <div className="flex gap-2 mt-5">
            <button
              type="button"
              className={buttonClass("primary")}
              onClick={() => {
                const r = confirming;
                setConfirming(null);
                setTouched(true);
                if (r === "promoter") {
                  setRole(r);
                  setPerms([]);
                } else openEditor(r, defaultPermissions(r));
              }}
            >
              Sim, é esse perfil
            </button>
            <button type="button" className={buttonClass("secondary")} onClick={() => setConfirming(null)}>
              Cancelar
            </button>
          </div>
        </Dialog>
      ) : null}

      {editing ? (
        <Dialog onClose={() => setEditing(false)} title={`Acessos do ${AGENCY_ROLE_LABEL[role]}`} wide>
          <p className="text-[13px] text-muted mb-3">Marque os painéis do sistema que esta pessoa pode ver. O que não estiver marcado some do menu dela.</p>
          <div className="flex gap-3 mb-3 text-[12.5px] font-semibold">
            <button type="button" className="text-brand-700 hover:underline" onClick={() => setDraft(panelsForRole(role).map((p) => p.key))}>
              Marcar todos
            </button>
            <button type="button" className="text-brand-700 hover:underline" onClick={() => setDraft([])}>
              Desmarcar todos
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 max-h-[55vh] overflow-y-auto pr-1">
            {groups(panelsForRole(role)).map(([group, list]) => (
              <fieldset key={group}>
                <legend className="text-[11.5px] font-bold uppercase tracking-wide text-muted mb-1.5">{group}</legend>
                <div className="space-y-1">
                  {list.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 text-[13.5px] rounded-lg px-2 py-1.5 hover:bg-subtle">
                      <input type="checkbox" checked={draft.includes(p.key)} onChange={(e) => setDraft((d) => (e.target.checked ? [...d, p.key] : d.filter((x) => x !== p.key)))} className="size-4" />
                      {p.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="flex gap-2 mt-5">
            <button
              type="button"
              className={buttonClass("primary")}
              onClick={() => {
                setPerms(draft);
                setTouched(true);
                setEditing(false);
              }}
            >
              <ShieldCheck className="size-4" /> Aplicar acessos ({draft.length})
            </button>
            <button type="button" className={buttonClass("secondary")} onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
          <p className="text-[11.5px] text-muted mt-2">Os acessos valem depois de clicar em “Salvar usuário”.</p>
        </Dialog>
      ) : null}
    </div>
  );
}

function groups(list: Panel[]): [string, Panel[]][] {
  const map = new Map<string, Panel[]>();
  for (const p of list) map.set(p.group, [...(map.get(p.group) ?? []), p]);
  return [...map.entries()];
}

function Dialog({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className={clsx("bg-surface rounded-2xl w-full shadow-xl p-5", wide ? "max-w-2xl" : "max-w-md")}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="size-8 grid place-items-center rounded-lg hover:bg-subtle">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
