import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { CALENDAR_MODES, calendarLines, embedUrl, OPEN_URL, parseMode } from "@/lib/google-calendar";
import { requireCan } from "@/server/auth";
import { formOptions } from "@/server/demands";
import { getCalendarConfig } from "@/server/google-calendar";
import { CalendarSettings } from "./calendar-settings";
import { NotionImporter } from "./importer";

export const metadata = { title: "Notion e Google Agenda" };

type Params = { aba?: string; modo?: string };

export default async function NotionImportPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireCan("import.run");
  const p = await searchParams;
  const agenda = p.aba === "agenda";
  const tabs = (
    <nav className="mb-4 flex flex-wrap gap-2" aria-label="Abas">
      <Link href="/config/importar-notion" className={agenda ? "btn-ghost" : "btn-primary"} aria-current={agenda ? undefined : "page"}>Importar do Notion</Link>
      <Link href="/config/importar-notion?aba=agenda" className={agenda ? "btn-primary" : "btn-ghost"} aria-current={agenda ? "page" : undefined}>Google Agenda</Link>
    </nav>
  );

  if (agenda) {
    const config = await getCalendarConfig();
    const mode = parseMode(p.modo);
    const src = embedUrl(config.calendars, mode);
    return (
      <>
        <PageHeader title="Google Agenda" subtitle="Os compromissos marcados no Google, aqui ao lado das tarefas do Notion. Para criar ou mudar um compromisso, use o próprio Google Agenda." />
        {tabs}
        {src ? (
          <section className="card p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {CALENDAR_MODES.map((m) => (
                <Link key={m.mode} href={`/config/importar-notion?aba=agenda&modo=${m.mode}`} className={m.mode === mode ? "btn-primary" : "btn-ghost"}>{m.label}</Link>
              ))}
              <span className="text-xs text-muted">{config.calendars.map((c) => c.label).join(" · ")}</span>
              <a href={OPEN_URL} target="_blank" rel="noopener noreferrer" className="btn-ghost ml-auto">Abrir no Google Agenda ↗</a>
            </div>
            <iframe title="Google Agenda" src={src} className="h-[70vh] min-h-[480px] w-full rounded-lg border border-line bg-white" />
            <p className="mt-2 text-xs text-muted">
              Aparecem os compromissos que a conta Google logada neste navegador pode ver. Se a agenda abrir vazia ou pedir login, entre no Google neste navegador (ou use “Abrir no Google Agenda”).
            </p>
          </section>
        ) : (
          <p className="card p-4 text-sm text-ink-2">Nenhuma agenda escolhida ainda. Informe abaixo quais agendas do Google devem aparecer aqui.</p>
        )}
        <section className="card mt-4 p-4">
          <h2 className="font-semibold text-brand-900">Quais agendas aparecem</h2>
          <CalendarSettings initial={calendarLines(config)} />
        </section>
      </>
    );
  }

  const options = await formOptions();
  return (
    <>
      <PageHeader title="Importar do Notion" subtitle="Traz as tarefas ainda abertas do banco “Projetos e Tarefas”. Primeiro você confere tudo; só entra o que você confirmar." />
      {tabs}
      <section className="card p-4">
        <NotionImporter categories={options.categories} clients={options.clients.map((c) => ({ id: c.id, name: c.name }))} />
      </section>
      <div className="mt-4 space-y-1 text-xs text-muted">
        <p><strong className="text-ink-2">Como exportar:</strong> no Notion, abra o banco “Projetos e Tarefas” › “•••” › Exportar › formato “Markdown &amp; CSV”. Use o arquivo .csv.</p>
        <p><strong className="text-ink-2">O que entra:</strong> tarefas não concluídas, com o status equivalente; “Data de Término” vira o prazo; “Clientes” vira o contratante. Concluídas e canceladas ficam só no Notion.</p>
        <p><strong className="text-ink-2">De-para fixo:</strong> Helvecio-Café e Helvecio-Barão → Helvécio (marcas Café Bravo e Barão); William Danper → Helvécio (Danper); Adriana → AF Merchandising; MCX, Maria e Tainara → Interno MCX.</p>
        <p><strong className="text-ink-2">Nada é inventado:</strong> sem responsável entra como “A distribuir”; sem data entra sem prazo. Importar o mesmo arquivo de novo não duplica.</p>
      </div>
    </>
  );
}
