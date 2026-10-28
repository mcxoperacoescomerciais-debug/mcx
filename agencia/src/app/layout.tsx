import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { getDb, schema as s } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { eq } from "drizzle-orm";
import { APP_NAME } from "@/components/ui";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

/** O app é o MCX Trade; com alguém logado, o título traz também a agência. */
export async function generateMetadata(): Promise<Metadata> {
  let app = APP_NAME;
  const user = await getSessionUser().catch(() => null);
  if (user && !user.platform) {
    const db = await getDb();
    const [a] = await db.select({ name: s.agencies.name }).from(s.agencies).where(eq(s.agencies.id, user.agencyId));
    if (a) app = `${APP_NAME} · ${a.name}`;
  }
  return {
    title: { default: app, template: `%s · ${app}` },
    description: "Trade marketing e execução em loja: promotores, roteiros, fotos, estoque, ruptura e validade.",
    applicationName: APP_NAME,
    appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
    icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = {
  themeColor: "#0c323a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
