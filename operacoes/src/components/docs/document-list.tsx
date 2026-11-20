import Link from "next/link";
import { formatBr } from "@/lib/dates";
import { formatBytes } from "@/lib/documents";

export interface ListedDocument {
  id: string;
  title: string;
  category: string;
  restricted: boolean;
  expiresOn: string | null;
  currentVersion: number;
  clientName: string | null;
  fileName: string | null;
  size: number | null;
  updatedAt: Date;
}

/** Lista de documentos (já filtrada pela permissão de quem vê). */
export function DocumentList({ documents, today, empty = "Nenhum documento." }: { documents: ListedDocument[]; today: string; empty?: string }) {
  if (documents.length === 0) return <p className="card px-4 py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-2">
      {documents.map((d) => {
        const expired = !!d.expiresOn && d.expiresOn < today;
        return (
          <li key={d.id} className="card flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3">
            <div className="min-w-0">
              <Link href={`/documentos/${d.id}`} className="font-semibold text-ink underline-offset-2 hover:underline">{d.title}</Link>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span className="rounded-full border border-line-strong bg-subtle px-2 py-0.5 font-semibold text-ink-2">{d.category}</span>
                {d.restricted && <span className="rounded-full bg-warn-bg px-2 py-0.5 font-semibold text-warn">Restrito</span>}
                {d.clientName && <span>{d.clientName}</span>}
                <span>· versão {d.currentVersion}</span>
                {d.size != null && <span>· {formatBytes(d.size)}</span>}
                {d.expiresOn && <span className={expired ? "font-semibold text-bad" : "text-ink-2"}>· {expired ? "venceu em" : "vale até"} {formatBr(d.expiresOn)}</span>}
              </p>
            </div>
            <a href={`/api/documentos/${d.id}`} className="btn-ghost shrink-0">Baixar</a>
          </li>
        );
      })}
    </ul>
  );
}
