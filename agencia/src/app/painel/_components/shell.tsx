"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  BarChart3,
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
import { BrandMark } from "@/components/ui";
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

function NavLinks({ role, fullScope, onNavigate }: { role: Role; fullScope: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-6">
      {NAV.map((group) => {
        const items = group.items.filter((i) => (!i.roles || i.roles.includes(role)) && (!i.fullScope || fullScope));
        if (!items.length) return null;
        return (
          <div key={group.title}>
            <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-200/60">{group.title}</p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = item.href === "/painel" ? pathname === "/painel" : pathname.startsWith(item.href);
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

export function PanelShell({
  user,
  agencyName,
  fullScope,
  scopeNote,
  logout,
  children,
}: {
  user: { name: string; role: Role };
  agencyName: string;
  fullScope: boolean;
  scopeNote: string | null;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:pl-[248px]">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[248px] bg-brand-900 flex-col px-3 py-5">
        <div className="px-2 mb-7">
          <BrandMark subtitle={agencyName} />
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks role={user.role} fullScope={fullScope} />
        </div>
        <UserBox name={user.name} role={user.role} scopeNote={scopeNote} logout={logout} />
      </aside>

      <header className="lg:hidden sticky top-0 z-30 bg-brand-900 h-14 flex items-center justify-between px-3 no-print">
        <button type="button" onClick={() => setOpen(true)} className="size-10 grid place-items-center text-white" aria-label="Abrir menu">
          <Menu className="size-6" />
        </button>
        <BrandMark subtitle={agencyName} />
        <span className="w-10" />
      </header>
      {open ? (
        <div className="lg:hidden fixed inset-0 z-50">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] bg-brand-900 px-3 py-4 flex flex-col">
            <div className="flex items-center justify-between px-2 mb-6">
              <BrandMark subtitle={agencyName} />
              <button type="button" onClick={() => setOpen(false)} className="size-9 grid place-items-center text-white" aria-label="Fechar">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks role={user.role} fullScope={fullScope} onNavigate={() => setOpen(false)} />
            </div>
            <UserBox name={user.name} role={user.role} scopeNote={scopeNote} logout={logout} />
          </div>
        </div>
      ) : null}

      <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1480px]">{children}</main>
    </div>
  );
}
