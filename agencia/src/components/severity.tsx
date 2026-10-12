/** Selo de severidade de validade (painel e listas). Cor sempre acompanhada do rótulo. */
import clsx from "clsx";
import { SEVERITY_COLOR, SEVERITY_LABEL, type Severity } from "@/lib/validity";

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const c = SEVERITY_COLOR[severity];
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 h-[22px] text-[11.5px] font-bold whitespace-nowrap", className)} style={{ background: c.bg, color: c.fg }}>
      <span className="size-1.5 rounded-full" style={{ background: c.solid }} />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}
