import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "MCX Operações", template: "%s · MCX Operações" },
  description: "Gestão interna da MCX: demandas, rotinas e equipe.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0f2038", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
