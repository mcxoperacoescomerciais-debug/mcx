import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import { mergeSettings, type ClientSettings } from "@/lib/settings";

export const getClientSettings = cache(async (clientId: string): Promise<ClientSettings> => {
  const db = await getDb();
  const [row] = await db.select().from(s.clientSettings).where(eq(s.clientSettings.clientId, clientId));
  return mergeSettings(row?.settings);
});
