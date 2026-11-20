/**
 * Envio de documento (multipart). Exige sessão do Operações; a permissão por
 * papel e a validação do arquivo acontecem nas funções de servidor.
 * Com `documentId`, o arquivo entra como nova versão do documento existente.
 */
import { revalidatePath } from "next/cache";
import { MAX_FILE_BYTES } from "@/lib/documents";
import { getSessionUser } from "@/server/auth";
import { addDocumentVersion, createDocument } from "@/server/documents";

export const dynamic = "force-dynamic";

const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return json({ ok: false, error: "Sessão expirada. Entre de novo." }, 401);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_FILE_BYTES + 64 * 1024) return json({ ok: false, error: `Arquivo grande demais (máximo de ${MAX_FILE_BYTES / 1024 / 1024} MB).` }, 413);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return json({ ok: false, error: "Escolha o arquivo." }, 400);
  if (file.size > MAX_FILE_BYTES) return json({ ok: false, error: `Arquivo grande demais (máximo de ${MAX_FILE_BYTES / 1024 / 1024} MB).` }, 413);
  const upload = { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
  const text = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
  const documentId = text("documentId");
  const result = documentId
    ? await addDocumentVersion(user, documentId, upload)
    : await createDocument(user, { title: text("title"), category: text("category"), clientId: text("clientId") || null, contractId: text("contractId") || null, brand: text("brand"), promoter: text("promoter"), restricted: text("restricted") === "1", expiresOn: text("expiresOn") || null }, upload);
  if (result.ok) revalidatePath("/", "layout");
  return json(result, result.ok ? 200 : 400);
}
