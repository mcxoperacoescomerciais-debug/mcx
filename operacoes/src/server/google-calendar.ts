/**
 * Quais agendas do Google aparecem na aba do Notion. Só guarda os IDs das
 * agendas (nada de senha ou token); quem configura é o gestor ou o dono.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { normalizeCalendarConfig, parseCalendarLines, type CalendarConfig } from "@/lib/google-calendar";
import { can } from "@/lib/permissions";
import { audit } from "./audit";
import { getDb, schema as s } from "./db";
import type { Actor, Result } from "./demands";

const KEY = "google_calendar";

export async function getCalendarConfig(): Promise<CalendarConfig> {
  const db = await getDb();
  const [row] = await db.select().from(s.settings).where(eq(s.settings.key, KEY));
  return normalizeCalendarConfig(row?.value);
}

export async function saveCalendarConfig(actor: Actor, text: string): Promise<Result> {
  if (!can(actor.role, "import.run")) return { ok: false, error: "Só o gestor e o dono escolhem as agendas." };
  if (text.length > 5000) return { ok: false, error: "Texto grande demais." };
  const { calendars, invalid } = parseCalendarLines(text);
  if (invalid.length) return { ok: false, error: `Não reconheci como agenda do Google: ${invalid.slice(0, 3).join(" · ")}. Use o e-mail da conta ou o “ID da agenda” (Configurações da agenda › Integrar agenda).` };
  const before = await getCalendarConfig();
  const next: CalendarConfig = { calendars };
  const db = await getDb();
  await db.insert(s.settings).values({ key: KEY, value: next }).onConflictDoUpdate({ target: s.settings.key, set: { value: next, updatedAt: new Date() } });
  await audit(actor.id, "settings", KEY, "updated", { before, after: next });
  return { ok: true, message: calendars.length ? `${calendars.length} ${calendars.length === 1 ? "agenda salva" : "agendas salvas"}.` : "Agendas removidas." };
}
