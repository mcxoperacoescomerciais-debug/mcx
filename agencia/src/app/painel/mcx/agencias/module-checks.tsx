/**
 * Recursos liberados para a agência (equipe MCX): uma caixa por recurso do registro
 * AGENCY_MODULES, agrupadas. Recurso novo no registro aparece aqui sozinho.
 */
import { AGENCY_MODULES, type AgencyModules } from "@/lib/settings";

export function ModuleChecks({ value }: { /** Como a agência está hoje; sem valor (agência nova) = padrão de cada recurso. */ value?: AgencyModules }) {
  const groups = [...new Set(AGENCY_MODULES.map((m) => m.group))];
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <fieldset key={g}>
          <legend className="text-[11.5px] font-semibold uppercase tracking-wide text-muted mb-1">{g}</legend>
          <div className="space-y-1.5">
            {AGENCY_MODULES.filter((m) => m.group === g).map((m) => (
              <label key={m.key} className="flex items-start gap-2 text-[13.5px]">
                <input type="checkbox" name={m.key} defaultChecked={value ? value[m.key] : m.on} className="mt-0.5" />
                <span>
                  {m.label}
                  <span className="block text-[12px] text-muted">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
