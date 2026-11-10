import type { CSSProperties } from "react";
import { Cormorant_Garamond } from "next/font/google";

// Títulos em Cormorant Garamond (próxima do desenho da logo); textos em Inter,
// que o layout raiz do app já carrega. O itálico é uma instância separada
// (o Turbopack não aceita normal + itálico na mesma chamada).
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-cormorant-diag",
  display: "swap",
});
const cormorantItalico = Cormorant_Garamond({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  variable: "--font-cormorant-italico",
  display: "swap",
});

const fontes = {
  "--font-display": 'var(--font-cormorant-diag), Georgia, "Times New Roman", serif',
} as CSSProperties;

export default function LayoutDiagnostico({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className={`diag-raiz ${cormorant.variable} ${cormorantItalico.variable} min-h-dvh bg-petroleo-900 font-sans text-perola`}
      style={fontes}
    >
      {children}
    </div>
  );
}
