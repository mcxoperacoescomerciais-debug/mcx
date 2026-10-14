import { runStorageCheck } from "@/server/storage-alert";

export const dynamic = "force-dynamic";

/**
 * Chamado 1x por dia pelo GitHub Actions (.github/workflows/aviso-armazenamento.yml).
 * Sem segredo: chamar de novo não duplica mensagens e a resposta não traz dados.
 */
export async function GET() {
  try {
    const { sent } = await runStorageCheck();
    return Response.json({ ok: true, sent });
  } catch (err) {
    console.error("[aviso armazenamento] falhou", err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
