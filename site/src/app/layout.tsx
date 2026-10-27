import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { site } from "@/config/site";
import { urlBase } from "@/lib/url";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
// Serifa de alto contraste, próxima do desenho da logo; usada só em títulos.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(urlBase),
  title: { default: site.seo.titulo, template: `%s | ${site.nome}` },
  description: site.seo.descricao,
  applicationName: site.nome,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: site.nome,
    title: site.seo.titulo,
    description: site.seo.descricao,
    url: "/",
    images: [{ url: site.seo.imagemCompartilhamento, width: 1200, height: 630, alt: site.nome }],
  },
  twitter: {
    card: "summary_large_image",
    title: site.seo.titulo,
    description: site.seo.descricao,
    images: [site.seo.imagemCompartilhamento],
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#000d36",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} ${cormorant.variable}`}>
      <body>{children}</body>
    </html>
  );
}
