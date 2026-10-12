"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  Building,
  ChevronDown,
  Globe2,
  Boxes,
  Building2,
  CalendarRange,
  ClipboardCheck,
  FileText,
  History,
  KeyRound,
  Images,
  LogOut,
  Menu,
  PackageSearch,
  Route,
  Settings,
  ShieldAlert,
  Store,
  Tags,
  Upload,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { BrandMark, McxFooter } from "@/components/ui";
import { ROLE_LABEL, type Role } from "@/lib/domain";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
  fullScope?: boolean;
}

const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "Operação",
    items: [
      { href: "/painel", label: "Painel do dia", icon: BarChart3 },
      { href: "/painel/pendencias", label: "Central de pendências", icon: ShieldAlert },
      { href: "/painel/promotores", label: "Promotores", icon: Users },
      { href: "/painel/lojas", label: "Lojas", icon: Store },
      { href: "/painel/programacao", label: "Programação", icon: CalendarRange, fullScope: true },
      { href: "/painel/roteiros", label: "Roteiros", icon: Route, fullScope: true },
    ],
  },
  {
    title: "Análise",
    items: [
      { href: "/painel/estoque", label: "Estoque", icon: PackageSearch },
      { href: "/painel/rupturas", label: "Rupturas", icon: ClipboardCheck },
      { href: "/painel/fotos", label: "Relatório fotográfico", icon: Images },
      { href: "/painel/relatorios", label: "Relatórios e exportação", icon: FileText },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { href: "/painel/cadastros/marcas", label: "Marcas", icon: Tags, roles: ["admin"] },
      { href: "/painel/cadastros/lojas", label: "Redes e lojas", icon: Building2, roles: ["admin"] },
      { href: "/painel/cadastros/produtos", label: "Produtos", icon: Boxes, roles: ["admin"] },
      { href: "/painel/cadastros/usuarios", label: "Usuários", icon: Users, roles: ["admin"] },
      { href: "/painel/cadastros/importar", label: "Importar planilha", icon: Upload, roles: ["admin"] },
      { href: "/painel/configuracoes", label: "Configurações", icon: Settings, roles: ["admin"] },
      { href: "/painel/auditoria", label: "Auditoria", icon: History, roles: ["admin"] },
    ],
  },
];

const MCX_NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "MCX",
    items: [
      { href: "/painel/mcx", label: "Visão geral (todas)", icon: Globe2 },
      { href: "/painel/mcx/agencias", label: "Agências", icon: Building },
    ],
  },
];

function NavLinks({ role, fullScope, mcx, onNavigate }: { role: Role; fullScope: boolean; mcx: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-6">
      {(mcx ? MCX_NAV : NAV).map((group) => {
        const items = group.items.filter((i) => (!i.roles || i.roles.includes(role)) && (!i.fullScope || fullScope));
        if (!items.length) return null;
        return (
          <div key={group.title}>
            <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-200/60">{group.title}</p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = item.href === "/painel" || item.href === "/painel/mcx" ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={clsx(
                        "flex items-center gap-2.5 h-9 px-3 rounded-lg text-[13.5px] font-medium transition-colors",
                        active ? "bg-white/12 text-white" : "text-brand-100/80 hover:bg-white/6 hover:text-white",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function UserBox({ name, role, scopeNote, logout }: { name: string; role: Role; scopeNote: string | null; logout: () => Promise<void> }) {
  return (
    <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-white/6">
      <span className="size-9 rounded-full bg-white text-brand-900 grid place-items-center font-bold text-[14px]">{name.slice(0, 1)}</span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[13px] font-semibold text-white truncate">{name}</p>
        <p className="text-[11px] text-brand-200 truncate">{scopeNote ?? ROLE_LABEL[role]}</p>
      </div>
      <Link href="/painel/senha" className="size-8 grid place-items-center rounded-lg text-brand-200 hover:bg-white/10 hover:text-white" aria-label="Trocar senha" title="Trocar senha">
        <KeyRound className="size-4" />
      </Link>
      <form action={logout}>
        <button className="size-8 grid place-items-center rounded-lg text-brand-200 hover:bg-white/10 hover:text-white" aria-label="Sair" title="Sair">
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}

interface PlatformProps {
  agencies: { id: string; name: string; status: "active" | "suspended" }[];
  enter: (fd: FormData) => Promise<void>;
  leave: () => Promise<void>;
}

/** Seletor da equipe MCX: visão macro ou o painel de UMA agência. */
function AgencySwitcher({ platform, current, onNavigate }: { platform: PlatformProps; current: string | null; onNavigate?: () => void }) {
  const currentName = current ? platform.agencies.find((a) => a.id === current)?.name : null;
  return (
    <details className="group relative mb-5 mx-1">
      <summary className="list-none cursor-pointer flex items-center gap-2 h-10 px-3 rounded-lg bg-white/8 hover:bg-white/12 text-white text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
        <ArrowLeftRight className="size-4 text-brand-200 shrink-0" />
        <span className="truncate flex-1">{currentName ?? "Visão MCX · todas"}</span>
        <ChevronDown className="size-4 text-brand-200 transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute z-40 left-0 right-0 mt-1 rounded-xl bg-white shadow-xl ring-1 ring-black/5 p-1.5 text-ink">
        <form action={platform.leave}>
          <button onClick={onNavigate} className={clsx("w-full text-left flex items-center gap-2 px-2.5 h-9 rounded-lg text-[13px] hover:bg-canvas", !current && "font-semibold")}>
            <Globe2 className="size-4 text-muted" /> Visão MCX (todas as agências)
          </button>
        </form>
        <p className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">Entrar no painel de</p>
        {platform.agencies.map((a) => (
          <form key={a.id} action={platform.enter}>
            <input type="hidden" name="agencyId" value={a.id} />
            <button onClick={onNavigate} className={clsx("w-full text-left flex items-center gap-2 px-2.5 h-9 rounded-lg text-[13px] hover:bg-canvas", a.id === current && "font-semibold bg-canvas")}>
              <Building className="size-4 text-muted" />
              <span className="truncate flex-1">{a.name}</span>
              {a.status === "suspended" ? <span className="text-[10.5px] text-bad font-semibold">suspensa</span> : null}
            </button>
          </form>
        ))}
        {!platform.agencies.length ? <p className="px-2.5 py-2 text-[12.5px] text-muted">Nenhuma agência cadastrada.</p> : null}
      </div>
    </details>
  );
}

export function PanelShell({
  user,
  agency,
  platform,
  fullScope,
  scopeNote,
  logout,
  children,
}: {
  user: { name: string; role: Role };
  agency: { id: string; name: string; logoUrl: string | null } | null;
  platform: PlatformProps | null;
  fullScope: boolean;
  scopeNote: string | null;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const mcx = Boolean(platform) && (pathname.startsWith("/painel/mcx") || !agency);
  const brand = mcx || !agency ? <BrandMark name="MCX" logoUrl="/mcx_logo.png" subtitle="Visão das agências" /> : <BrandMark name={agency.name} logoUrl={agency.logoUrl} subtitle="Execução em loja" />;
  const sidebar = (onNavigate?: () => void) => (
    <>
      {platform ? <AgencySwitcher platform={platform} current={mcx ? null : agency?.id ?? null} onNavigate={onNavigate} /> : null}
      <div className="flex-1 overflow-y-auto">
        <NavLinks role={user.role} fullScope={fullScope} mcx={mcx} onNavigate={onNavigate} />
      </div>
      <UserBox name={user.name} role={user.role} scopeNote={scopeNote} logout={logout} />
      <McxFooter className="mt-3" />
    </>
  );
  return (
    <div className="min-h-dvh lg:pl-[248px]">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[248px] bg-brand-900 flex-col px-3 py-5">
        <div className="px-2 mb-5">{brand}</div>
        {sidebar()}
      </aside>

      <header className="lg:hidden sticky top-0 z-30 bg-brand-900 h-14 flex items-center justify-between px-3 no-print">
        <button type="button" onClick={() => setOpen(true)} className="size-10 grid place-items-center text-white" aria-label="Abrir menu">
          <Menu className="size-6" />
        </button>
        <div className="min-w-0">{brand}</div>
        <span className="w-10" />
      </header>
      {open ? (
        <div className="lg:hidden fixed inset-0 z-50">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] bg-brand-900 px-3 py-4 flex flex-col">
            <div className="flex items-center justify-between px-2 mb-5">
              {brand}
              <button type="button" onClick={() => setOpen(false)} className="size-9 grid place-items-center text-white" aria-label="Fechar">
                <X className="size-5" />
              </button>
            </div>
            {sidebar(() => setOpen(false))}
          </div>
        </div>
      ) : null}

      <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1480px]">
        {platform && !mcx && agency ? (
          <div className="mb-5 rounded-xl bg-info-bg text-info px-4 py-2.5 text-[13px] flex flex-wrap items-center justify-between gap-2 no-print">
            <span>
              Você está no painel da <strong>{agency.name}</strong> (acesso MCX). Tudo o que aparece aqui é só desta agência.
            </span>
            <form action={platform.leave}>
              <button className="font-semibold underline">Voltar à visão MCX</button>
            </form>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
