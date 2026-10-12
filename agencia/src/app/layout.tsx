import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { getDb, schema as s } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { eq } from "drizzle-orm";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

/** O nome do app é o da agência de quem está logado (a MCX aparece só no rodapé). */
export async function generateMetadata(): Promise<Metadata> {
  let app = "Execução em loja";
  const user = await getSessionUser().catch(() => null);
  if (user && !user.platform) {
    const db = await getDb();
    const [a] = await db.select({ name: s.agencies.name }).from(s.agencies).where(eq(s.agencies.id, user.agencyId));
    if (a) app = a.name;
  } else if (user?.platform) app = "MCX";
  return {
    title: { default: app, template: `%s · ${app}` },
    description: "Gestão de promotores, execução em loja, fotos, estoque e ruptura.",
    applicationName: app,
    appleWebApp: { capable: true, title: app, statusBarStyle: "black-translucent" },
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
