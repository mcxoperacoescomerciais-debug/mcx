"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ClipboardList,
  FileBarChart2,
  History,
  LogOut,
  Menu,
  Settings,
  Store,
  Upload,
  Users,
  Network,
  X,
} from "lucide-react";
import clsx from "clsx";
import { BrandMark } from "@/components/ui";
import { ROLE_LABEL, type Role } from "@/lib/domain";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Store;
  roles?: Role[];
}

const STAFF: Role[] = ["admin", "agency_manager"];

const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "Gestão",
    items: [
      { href: "/painel", label: "Dashboard", icon: BarChart3 },
      { href: "/painel/alertas", label: "Alertas", icon: AlertTriangle },
      { href: "/painel/lojas", label: "Lojas", icon: Store },
      { href: "/painel/produtos", label: "Produtos", icon: Boxes },
      { href: "/painel/visitas", label: "Visitas", icon: ClipboardList },
      { href: "/painel/promotores", label: "Promotores", icon: Users },
      { href: "/painel/relatorios", label: "Relatórios", icon: FileBarChart2 },
    ],
  },
  {
    title: "Administração",
    items: [
      { href: "/painel/admin/usuarios", label: "Usuários", icon: Users, roles: ["admin"] },
      { href: "/painel/admin/redes", label: "Redes", icon: Network, roles: STAFF },
      { href: "/painel/admin/lojas", label: "Cadastro de lojas", icon: Store, roles: STAFF },
      { href: "/painel/admin/produtos", label: "Cadastro de produtos", icon: Boxes, roles: STAFF },
      { href: "/painel/admin/importar", label: "Importar planilha", icon: Upload, roles: STAFF },
      { href: "/painel/configuracoes", label: "Configurações", icon: Settings, roles: STAFF },
      { href: "/painel/admin/auditoria", label: "Auditoria", icon: History, roles: ["admin"] },
    ],
  },
];

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-6">
      {NAV.map((group) => {
        const items = group.items.filter((i) => !i.roles || i.roles.includes(role));
        if (!items.length) return null;
        return (
          <div key={group.title}>
            <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-silver-300/60">{group.title}</p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = item.href === "/painel" ? pathname === "/painel" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={clsx(
                        "flex items-center gap-2.5 h-9 px-3 rounded-lg text-[13.5px] font-medium transition-colors",
                        active ? "bg-white/10 text-white" : "text-silver-300 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <Icon className={clsx("size-4", active ? "text-gold-400" : "")} />
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

function UserBox({ name, role, logout }: { name: string; role: Role; logout: () => Promise<void> }) {
  return (
    <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-white/5">
      <span className="size-9 rounded-full bg-gold-500 text-navy-950 grid place-items-center font-bold text-[14px]">{name.slice(0, 1)}</span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[13px] font-semibold text-white truncate">{name}</p>
        <p className="text-[11px] text-silver-300 truncate">{ROLE_LABEL[role]}</p>
      </div>
      <form action={logout}>
        <button className="size-8 grid place-items-center rounded-lg text-silver-300 hover:bg-white/10 hover:text-white" aria-label="Sair" title="Sair">
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}

export function PanelShell({ user, clientName, logout, children }: { user: { name: string; role: Role }; clientName: string; logout: () => Promise<void>; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:pl-[248px]">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[248px] bg-navy-900 flex-col px-3 py-5">
        <div className="px-2 mb-7">
          <BrandMark />
          <p className="mt-3 text-[11px] text-silver-300/70">
            {clientName} · AF Merchandising
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks role={user.role} />
        </div>
        <UserBox name={user.name} role={user.role} logout={logout} />
      </aside>

      <header className="lg:hidden sticky top-0 z-30 bg-navy-900 h-14 flex items-center justify-between px-3">
        <button type="button" onClick={() => setOpen(true)} className="size-10 grid place-items-center text-white" aria-label="Abrir menu">
          <Menu className="size-6" />
        </button>
        <BrandMark compact />
        <span className="w-10" />
      </header>
      {open ? (
        <div className="lg:hidden fixed inset-0 z-50">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[272px] bg-navy-900 px-3 py-4 flex flex-col">
            <div className="flex items-center justify-between px-2 mb-6">
              <BrandMark />
              <button type="button" onClick={() => setOpen(false)} className="size-9 grid place-items-center text-white" aria-label="Fechar">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks role={user.role} onNavigate={() => setOpen(false)} />
            </div>
            <UserBox name={user.name} role={user.role} logout={logout} />
          </div>
        </div>
      ) : null}

      <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1440px]">{children}</main>
    </div>
  );
}
