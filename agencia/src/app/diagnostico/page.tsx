import type { Metadata, Viewport } from "next";
import { Diagnostico } from "@/components/diagnostico/Diagnostico";
import { MARCA } from "@/lib/diagnostico";

const titulo = `Diagnóstico Operacional | ${MARCA.nome}`;
const descricao =
  "Descubra onde sua agência está perdendo tempo e dinheiro em apenas 2 minutos. Avaliação dos processos administrativos e operacionais, com recomendações práticas.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://mcx-campo.onrender.com"),
  title: { absolute: titulo },
  description: descricao,
  applicationName: MARCA.nome,
  alternates: { canonical: "/diagnostico/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: MARCA.nome,
    title: titulo,
    description: descricao,
    url: "/diagnostico/",
    images: [{ url: "/diagnostico/logo-oficial.png", width: 749, height: 749, alt: MARCA.nome }],
  },
  twitter: { card: "summary", title: titulo, description: descricao, images: ["/diagnostico/logo-oficial.png"] },
};

export const viewport: Viewport = { themeColor: "#0b3033" };

export default function PaginaDiagnostico() {
  return <Diagnostico />;
}
