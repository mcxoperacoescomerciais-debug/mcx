"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { site } from "@/config/site";
import { navegacao } from "@/content/conteudo";
import { linkWhatsAppMcx } from "@/lib/whatsapp";

export function Cabecalho() {
  const [aberto, setAberto] = useState(false);
  const [rolou, setRolou] = useState(false);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Com WhatsApp configurado o destaque abre a conversa; sem ele, leva à seção de contato.
  const hrefDestaque = linkWhatsAppMcx() ?? "#contato";
  const destaqueExterno = hrefDestaque.startsWith("http");

  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 12);
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    document.body.style.overflow = "hidden";
    menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        botaoRef.current?.focus();
      }
    };
    const aoRedimensionar = () => window.innerWidth >= 1024 && setAberto(false);
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("resize", aoRedimensionar);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("resize", aoRedimensionar);
    };
  }, [aberto]);

  const fundoSolido = rolou || aberto;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow] duration-300 ${
        fundoSolido ? "bg-navy-950/95 shadow-[0_1px_0_rgba(255,255,255,.08)] backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-navy-900"
      >
        Pular para o conteúdo
      </a>
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
        <a href="#inicio" className="flex shrink-0 items-center gap-3" aria-label={`${site.nome} — início`}>
          <Image src={site.logo.monogramaClaro} alt="" width={240} height={143} priority className="h-9 w-auto" />
          <span
            aria-hidden="true"
            className="border-l border-white/20 pl-3 text-[10px] font-medium uppercase leading-[1.35] tracking-[0.28em] text-prata-300"
          >
            Operações
            <br />
            Comerciais
          </span>
        </a>

        <nav aria-label="Principal" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {navegacao.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="rounded-full px-4 py-2 text-[15px] text-prata-200 transition-colors hover:bg-white/8 hover:text-white"
                >
                  {item.rotulo}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={hrefDestaque}
            {...(destaqueExterno ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="hidden min-h-11 items-center rounded-full bg-prata-100 px-5 text-sm font-semibold text-navy-900 transition-colors hover:bg-white sm:inline-flex"
          >
            Fale com a MCX
            {destaqueExterno && <span className="sr-only"> (abre o WhatsApp em uma nova aba)</span>}
          </a>
          <button
            ref={botaoRef}
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full text-white hover:bg-white/10 lg:hidden"
            aria-expanded={aberto}
            aria-controls="menu-movel"
            onClick={() => setAberto((v) => !v)}
          >
            {aberto ? <X className="size-6" aria-hidden="true" /> : <Menu className="size-6" aria-hidden="true" />}
            <span className="sr-only">{aberto ? "Fechar menu" : "Abrir menu"}</span>
          </button>
        </div>
      </div>

      <div
        id="menu-movel"
        ref={menuRef}
        hidden={!aberto}
        className="h-[calc(100dvh-72px)] overflow-y-auto border-t border-white/10 bg-navy-950 px-5 pb-10 pt-4 lg:hidden"
      >
        <nav aria-label="Menu">
          <ul className="flex flex-col">
            {navegacao.map((item) => (
              <li key={item.id} className="border-b border-white/8">
                <a
                  href={`#${item.id}`}
                  onClick={() => setAberto(false)}
                  className="block py-4 font-display text-2xl text-prata-100 hover:text-white"
                >
                  {item.rotulo}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <a
          href={hrefDestaque}
          onClick={() => setAberto(false)}
          {...(destaqueExterno ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="mt-8 flex min-h-12 items-center justify-center rounded-full bg-prata-100 px-6 font-semibold text-navy-900"
        >
          Fale com a MCX
        </a>
      </div>
    </header>
  );
}
