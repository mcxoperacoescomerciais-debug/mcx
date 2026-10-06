import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getScope, requireRole, STAFF_ROLES } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { STORE_FORMAT_LABEL, UNITS, type StoreFormat } from "@/lib/domain";
import { Field, FormNotice, Input, Select } from "../../../_components/form";
import { saveProductAction } from "../../actions";

export const metadata: Metadata = { title: "Produto" };

const CATEGORIES = ["Cortes temperados", "Defumados", "Embutidos", "Frios e fatiados", "Salgados", "Outros"];

export default async function ProductFormPage({ params, searchParams }: PageProps<"/painel/admin/produtos/[id]">) {
  await requireRole(STAFF_ROLES);
  const { id } = await params;
  const sp = await searchParams;
  const scope = await getScope();
  const db = await getDb();
  const isNew = id === "novo";
  const [p] = isNew ? [null] : await db.select().from(s.products).where(and(eq(s.products.id, id), eq(s.products.clientId, scope.clientId)));
  if (!isNew && !p) notFound();
  const mixes = p
    ? await db
        .select({ network: s.networks.name, format: s.productMixes.format, chainCode: s.productMixes.chainCode, note: s.productMixes.note })
        .from(s.productMixes)
        .innerJoin(s.networks, eq(s.networks.id, s.productMixes.networkId))
        .where(eq(s.productMixes.productId, p.id))
    : [];

  return (
    <>
      <PageHeader title={isNew ? "Novo produto" : p!.name} subtitle={<Link href="/painel/admin/produtos" className="hover:underline">← Cadastro de produtos</Link>} />
      <div className="mb-4 max-w-4xl">
        <FormNotice ok={sp.ok as string | undefined} error={sp.erro as string | undefined} />
      </div>
      <form action={saveProductAction} className="space-y-4 max-w-4xl">
        {p ? <input type="hidden" name="id" value={p.id} /> : null}
        <Card className="p-5 grid md:grid-cols-3 gap-4">
          <Field label="Código SUINCO">
            <Input name="code" defaultValue={p?.code ?? ""} />
          </Field>
          <Field label="Nome" className="md:col-span-2">
            <Input name="name" required defaultValue={p?.name ?? ""} />
          </Field>
          <Field label="Categoria">
            <Select name="category" defaultValue={p?.category ?? "Outros"}>
              {[...new Set([...CATEGORIES, p?.category ?? "Outros"])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Unidade padrão">
            <Select name="defaultUnit" defaultValue={p?.defaultUnit ?? "un"}>
              {UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={p?.status ?? "active"}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </Select>
          </Field>
          <Field label="Peso / apresentação">
            <Input name="presentation" defaultValue={p?.presentation ?? ""} placeholder="Ex.: 2,5kg" />
          </Field>
          <Field label="Preço de tabela (R$)" hint="Referência mostrada ao promotor">
            <Input name="referencePrice" defaultValue={p?.referencePrice ? Number(p.referencePrice).toFixed(2).replace(".", ",") : ""} inputMode="decimal" />
          </Field>
          <Field label="Apelidos para busca" className="md:col-span-3" hint="Como os promotores escrevem o produto, separados por vírgula. Ex.: ling embutido, embutido misto">
            <Input name="aliases" defaultValue={(p?.aliases ?? []).join(", ")} />
          </Field>
        </Card>
        {mixes.length ? (
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold mb-3">Presente nos mixes</h2>
            <div className="flex flex-wrap gap-2">
              {mixes.map((m) => (
                <Badge key={`${m.network}${m.format}`} tone="neutral">
                  {m.network} {STORE_FORMAT_LABEL[m.format as StoreFormat]}
                  {m.chainCode ? ` · cód. rede ${m.chainCode}` : ""}
                </Badge>
              ))}
            </div>
            {mixes.find((m) => m.note) ? <p className="text-[12.5px] text-muted mt-3">Manipulação: {mixes.find((m) => m.note)!.note}</p> : null}
          </Card>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" size="lg">
            Salvar produto
          </Button>
        </div>
      </form>
    </>
  );
}
