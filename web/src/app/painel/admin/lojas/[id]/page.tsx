import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getScope, requireRole, STAFF_ROLES } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { Button, Card, PageHeader } from "@/components/ui";
import { STORE_FORMAT_LABEL } from "@/lib/domain";
import { Field, FormNotice, Input, Select } from "../../../_components/form";
import { saveStoreAction } from "../../actions";

export const metadata: Metadata = { title: "Loja" };

/** Formulário de loja: /nova cria, /[id] edita. */
export default async function StoreFormPage({ params, searchParams }: PageProps<"/painel/admin/lojas/[id]">) {
  await requireRole(STAFF_ROLES);
  const { id } = await params;
  const sp = await searchParams;
  const scope = await getScope();
  const db = await getDb();
  const isNew = id === "nova";
  const [store] = isNew ? [null] : await db.select().from(s.stores).where(and(eq(s.stores.id, id), eq(s.stores.clientId, scope.clientId)));
  if (!isNew && !store) notFound();
  const networks = await db.select({ id: s.networks.id, name: s.networks.name }).from(s.networks).where(eq(s.networks.clientId, scope.clientId)).orderBy(s.networks.name);
  const promoters = await db
    .select({ id: s.users.id, name: s.users.name })
    .from(s.users)
    .innerJoin(s.userClients, eq(s.userClients.userId, s.users.id))
    .where(and(eq(s.userClients.clientId, scope.clientId), eq(s.users.role, "promoter"), eq(s.users.status, "active")))
    .orderBy(s.users.name);
  const [current] = store
    ? await db
        .select({ userId: s.storeAssignments.userId })
        .from(s.storeAssignments)
        .innerJoin(s.users, eq(s.users.id, s.storeAssignments.userId))
        .where(and(eq(s.storeAssignments.storeId, store.id), eq(s.users.role, "promoter")))
    : [];

  return (
    <>
      <PageHeader title={isNew ? "Nova loja" : `${store!.name}${store!.code ? ` · ${store!.code}` : ""}`} subtitle={<Link href="/painel/admin/lojas" className="hover:underline">← Cadastro de lojas</Link>} />
      <div className="mb-4 max-w-4xl">
        <FormNotice ok={sp.ok as string | undefined} error={sp.erro as string | undefined} />
      </div>
      <form action={saveStoreAction} className="space-y-4 max-w-4xl">
        {store ? <input type="hidden" name="id" value={store.id} /> : null}
        <Card className="p-5 grid md:grid-cols-3 gap-4">
          <Field label="Rede">
            <Select name="networkId" defaultValue={store?.networkId ?? networks[0]?.id} required>
              {networks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Formato" hint="Define o mix de produtos">
            <Select name="format" defaultValue={store?.format ?? "varejo"}>
              {Object.entries(STORE_FORMAT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={store?.status ?? "active"}>
              <option value="active">Ativa</option>
              <option value="inactive">Inativa</option>
            </Select>
          </Field>
          <Field label="Nome" className="md:col-span-2">
            <Input name="name" required defaultValue={store?.name ?? ""} placeholder="Ex.: ABC Formiga" />
          </Field>
          <Field label="Número / código da loja">
            <Input name="code" defaultValue={store?.code ?? ""} placeholder="Ex.: 63" />
          </Field>
          <Field label="Endereço" className="md:col-span-3">
            <Input name="address" defaultValue={store?.address ?? ""} />
          </Field>
          <Field label="Cidade">
            <Input name="city" required defaultValue={store?.city ?? ""} />
          </Field>
          <Field label="UF">
            <Input name="state" defaultValue={store?.state ?? "MG"} maxLength={2} />
          </Field>
          <Field label="Responsável na loja">
            <Input name="managerName" defaultValue={store?.managerName ?? ""} />
          </Field>
          <Field label="Latitude" hint="Para o mapa (opcional)">
            <Input name="lat" defaultValue={store?.lat ?? ""} inputMode="decimal" />
          </Field>
          <Field label="Longitude">
            <Input name="lng" defaultValue={store?.lng ?? ""} inputMode="decimal" />
          </Field>
          <Field label="Promotor responsável">
            <Select name="promoterId" defaultValue={current?.userId ?? ""}>
              <option value="">— sem promotor —</option>
              {promoters.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" size="lg">
            Salvar loja
          </Button>
        </div>
      </form>
    </>
  );
}
