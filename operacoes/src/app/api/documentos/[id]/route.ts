/**
 * Download / pré-visualização de documento. Não existe URL pública: a cada
 * acesso a sessão e a permissão são conferidas. Sem permissão a resposta é 404,
 * igual a "não existe" — o ID correto não revela nada.
 */
import { canPreview } from "@/lib/documents";
import { getSessionUser } from "@/server/auth";
import { readDocumentFile } from "@/server/documents";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await params;
  const url = new URL(request.url);
  const v = Number(url.searchParams.get("v"));
  const file = await readDocumentFile(user, id, Number.isInteger(v) && v > 0 ? v : undefined);
  if (!file) return new Response("Documento não encontrado.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const inline = url.searchParams.get("ver") === "1" && canPreview(file.contentType);
  return new Response(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Um PDF ou imagem aberto no navegador não executa script nem carrega nada de fora.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; sandbox",
    },
  });
}
