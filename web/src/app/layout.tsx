import type { Metadata, Viewport } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
// Serifada fina, ecoando o "MCX" da logo — usada só em títulos de marca.
const display = Cormorant_Garamond({ variable: "--font-display-serif", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: { default: "SUINCO | Gestão de Loja", template: "%s · SUINCO Gestão de Loja" },
  description: "Controle de validades, rupturas e avarias — AF Merchandising · MCX",
  applicationName: "SUINCO Gestão de Loja",
  appleWebApp: { capable: true, title: "SUINCO Loja", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b1236",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
