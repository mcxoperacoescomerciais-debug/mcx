/**
 * Chamada à API da Anthropic (só no servidor). A chave vem de ANTHROPIC_API_KEY
 * e nunca vai para o navegador. Nada de login/cookie do claude.ai aqui.
 *
 * Com ferramentas de consulta: o modelo pede uma consulta, o servidor executa
 * (runTool) e devolve o resultado; repete até o modelo responder (máx. 6 voltas).
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { TurnRequest, TurnResult, Streamer } from "./assistant";

let client: Anthropic | null = null;

export const hasApiKey = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

const MAX_TOOL_ROUNDS = 6;

export const anthropicStreamer: Streamer = async (req: TurnRequest, onText, signal): Promise<TurnResult> => {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  // Sonnet 5.5: se o filtro de segurança recusar, a própria API tenta de novo no modelo reserva.
  const fallback = req.model === "claude-sonnet-5-5";
  const messages = [...req.messages];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let text = "";
  let stopReason: string | null = null;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const withTools = !!req.tools?.length && !!req.runTool && round < MAX_TOOL_ROUNDS;
    const stream = client.beta.messages.stream(
      {
        model: req.model,
        max_tokens: 8000,
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages,
        output_config: { effort: req.effort },
        ...(withTools ? { tools: req.tools } : {}),
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal },
    );
    stream.on("text", (delta) => onText(delta));
    const message = await stream.finalMessage();
    const u = message.usage;
    usage.input += u.input_tokens ?? 0;
    usage.output += u.output_tokens ?? 0;
    usage.cacheRead += u.cache_read_input_tokens ?? 0;
    usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
    text += message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    stopReason = message.stop_reason ?? null;

    const calls = message.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
    if (stopReason !== "tool_use" || !calls.length || !withTools) break;
    messages.push({ role: "assistant", content: message.content as Anthropic.Beta.Messages.BetaContentBlockParam[] });
    const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const input = call.input && typeof call.input === "object" && !Array.isArray(call.input) ? (call.input as Record<string, unknown>) : {};
      const r = await req.runTool!(call.name, input);
      results.push({ type: "tool_result", tool_use_id: call.id, content: r.text, ...(r.isError ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
    if (text && !text.endsWith("\n")) {
      text += "\n\n";
      onText("\n\n");
    }
  }

  return { text, stopReason, usage };
};

/** Erro da API em português, sem expor detalhes internos. */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "A chave da API do Assistente é inválida. Avise o Eduardo.";
  if (err instanceof Anthropic.RateLimitError) return "Muitas mensagens ao mesmo tempo. Espere um minuto e tente de novo.";
  if (err instanceof Anthropic.BadRequestError) return "A API recusou esta mensagem (arquivo grande ou formato não aceito). Tente sem o anexo ou com um arquivo menor.";
  if (err instanceof Anthropic.APIConnectionError) return "Sem conexão com a API agora. Tente de novo em instantes.";
  if (err instanceof Anthropic.APIError) return "A API do Assistente está com problema agora. Tente de novo em instantes.";
  if (err instanceof Error && err.name === "AbortError") return "Resposta interrompida.";
  return "Não consegui responder agora. Tente de novo.";
}
