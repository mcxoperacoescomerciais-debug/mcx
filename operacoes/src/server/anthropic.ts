/**
 * Chamada à API da Anthropic (só no servidor). A chave vem de ANTHROPIC_API_KEY
 * e nunca vai para o navegador. Nada de login/cookie do claude.ai aqui.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { TurnRequest, TurnResult, Streamer } from "./assistant";

let client: Anthropic | null = null;

export const hasApiKey = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

export const anthropicStreamer: Streamer = async (req: TurnRequest, onText, signal): Promise<TurnResult> => {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  // Sonnet 5.5: se o filtro de segurança recusar, a própria API tenta de novo no modelo reserva.
  const fallback = req.model === "claude-sonnet-5-5";
  const stream = client.beta.messages.stream(
    {
      model: req.model,
      max_tokens: 8000,
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: req.messages,
      output_config: { effort: req.effort },
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    },
    { signal },
  );
  stream.on("text", (delta) => onText(delta));
  const message = await stream.finalMessage();
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  const u = message.usage;
  return {
    text,
    stopReason: message.stop_reason ?? null,
    usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 },
  };
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
