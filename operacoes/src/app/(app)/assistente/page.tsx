import { PageHeader } from "@/components/ui";
import { fmtUsd, PROMPTS_MCX } from "@/lib/assistant";
import { requireCan } from "@/server/auth";
import { hasApiKey } from "@/server/anthropic";
import { assistantAccess, getConversation, listConversations, purgeOldConversations } from "@/server/assistant";
import { CAPABILITIES } from "@/server/capabilities";
import { Chat } from "./chat";

export const metadata = { title: "Assistente" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string; arquivadas?: string }> }) {
  const user = await requireCan("assistant.use");
  const params = await searchParams;
  await purgeOldConversations().catch((err) => console.error("[assistente] retenção", err));
  const archived = params.arquivadas === "1";
  const [access, conversations, current] = await Promise.all([
    assistantAccess(user, hasApiKey()),
    listConversations(user, archived),
    params.c ? getConversation(user, params.c) : Promise.resolve(null),
  ]);
  // "O que posso pedir?": exemplos do registro de capacidades, filtrados pelo perfil.
  const suggestions = CAPABILITIES.filter((c) => c.roles.includes(user.role) && c.channels.includes("assistente")).map((c) => ({ title: c.title, examples: c.examples }));
  return (
    <>
      <PageHeader
        title="Assistente MCX"
        subtitle={`Chat com IA da MCX. Seu uso no mês: ${fmtUsd(access.spentUserMicros)} de US$ ${access.limitUserUsd}.`}
      />
      <Chat
        key={current?.conversation.id ?? (archived ? "nova-arquivadas" : "nova")}
        access={{ canUse: access.canUse, reason: access.reason, warn: access.user === "warn" || access.global === "warn" }}
        conversations={conversations.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() }))}
        archived={archived}
        current={
          current
            ? {
                id: current.conversation.id,
                title: current.conversation.title,
                archived: current.conversation.archived,
                messages: current.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, attachments: m.attachments.map((a) => a.name), error: m.error })),
              }
            : null
        }
        prompts={PROMPTS_MCX}
        suggestions={suggestions}
      />
    </>
  );
}
