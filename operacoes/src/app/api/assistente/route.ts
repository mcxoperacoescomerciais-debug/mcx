/**
 * Mensagem para o Assistente MCX (multipart: conversationId, text, files).
 * Responde em streaming: linhas JSON — {"c":id} ao criar, {"t":"texto"} a cada
 * trecho, e no fim {"done":true,...} ou {"error":"..."}. A chave da API fica
 * só no servidor.
 */
import { getSessionUser } from "@/server/auth";
import { anthropicStreamer, hasApiKey } from "@/server/anthropic";
import { runTurn, type TurnFile } from "@/server/assistant";
import { MAX_ATTACH_BYTES, MAX_ATTACHMENTS } from "@/lib/assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ ok: false, error: "Sessão expirada. Entre de novo." }, { status: 401 });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_ATTACHMENTS * MAX_ATTACH_BYTES + 256 * 1024) return Response.json({ ok: false, error: "Anexos grandes demais." }, { status: 413 });
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ ok: false, error: "Mensagem inválida." }, { status: 400 });
  const files: TurnFile[] = [];
  for (const v of form.getAll("files")) {
    if (v instanceof File && v.size > 0) files.push({ name: v.name, type: v.type, size: v.size, bytes: new Uint8Array(await v.arrayBuffer()) });
  }
  const conversationId = typeof form.get("conversationId") === "string" && form.get("conversationId") ? String(form.get("conversationId")) : null;
  const text = typeof form.get("text") === "string" ? String(form.get("text")) : "";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        // Sem o signal da requisição: se a pessoa fechar a tela, a resposta termina e fica gravada.
        const result = await runTurn(user, { conversationId, text, files }, anthropicStreamer, {
          hasKey: hasApiKey(),
          onStart: (id) => send({ c: id }),
          onText: (t) => send({ t }),
        });
        send(result.ok ? { done: true, conversationId: result.conversationId, costMicros: result.costMicros } : { error: result.error });
      } catch (err) {
        console.error("[assistente]", err);
        send({ error: "Não consegui responder agora. Tente de novo." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
