import { PageHeader } from "@/components/ui";
import { requireCan } from "@/server/auth";
import { formOptions } from "@/server/demands";
import { NotionImporter } from "./importer";

export const metadata = { title: "Importar do Notion" };

export default async function NotionImportPage() {
  await requireCan("import.run");
  const options = await formOptions();
  return (
    <>
      <PageHeader title="Importar do Notion" subtitle="Traz as tarefas ainda abertas do banco “Projetos e Tarefas”. Primeiro você confere tudo; só entra o que você confirmar." />
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
