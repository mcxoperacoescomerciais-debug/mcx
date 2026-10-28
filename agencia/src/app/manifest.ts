import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { APP_NAME } from "@/components/ui";

/** App instalado: "MCX Trade", com a agência do usuário no nome completo (promotor instala já logado). */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name: string | null = null;
  const user = await getSessionUser().catch(() => null);
  if (user && !user.platform) {
    const db = await getDb();
    const [a] = await db.select({ name: s.agencies.name }).from(s.agencies).where(eq(s.agencies.id, user.agencyId));
    if (a) name = a.name;
  }
  return {
    name: name ? `${APP_NAME} · ${name}` : APP_NAME,
    short_name: APP_NAME,
    description: "Trade marketing e execução em loja: roteiro, fotos do antes e depois, estoque, ruptura e validade.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c323a",
    theme_color: "#0c323a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
