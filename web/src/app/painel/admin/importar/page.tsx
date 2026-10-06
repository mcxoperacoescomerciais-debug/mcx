import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { getScope, requireRole, STAFF_ROLES } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { Card, PageHeader } from "@/components/ui";
import { TEMPLATES } from "@/server/import/tabular";
import { MixImportForm, TableImportForm } from "./import-forms";

export const metadata: Metadata = { title: "Importar planilha" };

export default async function ImportPage() {
  const user = await requireRole(STAFF_ROLES);
  const scope = await getScope();
  const db = await getDb();
  const networks = await db.select({ id: s.networks.id, name: s.networks.name }).from(s.networks).where(eq(s.networks.clientId, scope.clientId)).orderBy(s.networks.name);

  return (
    <>
      <PageHeader title="Importar planilha" subtitle="Carregue os cadastros em lote. Reimportar a mesma planilha atualiza os registros, não duplica." />
      <div className="grid gap-4 max-w-5xl">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Mix de produtos SUINCO</h2>
          <p className="text-[13px] text-muted mt-1 mb-4">
            Use a planilha de MIX enviada pela SUINCO (ex.: &quot;MIX ABC VAREJO - PLUS e CASH.xlsx&quot;). Cada aba vira o mix de um formato (Varejo, Plus, Cash); a aba
            &quot;vigente&quot; atualiza o preço de tabela. Produtos novos são criados pelo código SUINCO; o mix do formato importado é substituído pelo da planilha.
          </p>
          <MixImportForm networks={networks} />
        </Card>
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Lojas</h2>
            <p className="text-[13px] text-muted mt-1 mb-2">Colunas: {TEMPLATES.lojas.join(", ")}. Redes que não existem são criadas.</p>
            <a download href="/api/templates/lojas" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-navy-700 hover:underline mb-4">
              <Download className="size-3.5" /> Baixar modelo
            </a>
            <TableImportForm kind="lojas" label="Planilha de lojas (.xlsx ou .csv)" />
          </Card>
          {user.role === "admin" ? (
            <Card className="p-5">
              <h2 className="text-[15px] font-semibold">Promotores</h2>
              <p className="text-[13px] text-muted mt-1 mb-2">Colunas: {TEMPLATES.promotores.join(", ")}. A senha inicial é obrigatória para usuários novos.</p>
              <a download href="/api/templates/promotores" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-navy-700 hover:underline mb-4">
                <Download className="size-3.5" /> Baixar modelo
              </a>
              <TableImportForm kind="promotores" label="Planilha de promotores (.xlsx ou .csv)" />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
