"use client";

import { panelForPath } from "@/lib/permissions";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import {
  BarChart3,
  ClipboardCheck,
  Lightbulb,
  Handshake,
  ArrowLeftRight,
  Boxes,
  Building,
  Building2,
  CalendarRange,
  Camera,
  ChevronDown,
  FileText,
  Globe2,
  HardDrive,
  UserCog,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  PackageSearch,
  Route,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Store,
  Tags,
  Target,
  Upload,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
  type LucideIcon,
  RefreshCw,
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
  /** Outras rotas que pertencem a este item (detalhes, abas). */
  also?: string[];
  /** Quantidade em destaque ao lado do nome (ex.: itens a revisar). */
  badge?: number;
}

/** Um assunto por página: o gestor escolhe o que quer analisar. */
const MAIN: NavItem[] = [
  { href: "/painel", label: "Visão geral", icon: LayoutDashboard },
  { href: "/painel/indicadores", label: "Indicadores", icon: BarChart3 },
  { href: "/painel/mapa", label: "Mapa operacional", icon: MapIcon },
  { href: "/painel/visitas", label: "Visitas", icon: Store, also: ["/painel/lojas"] },
  { href: "/painel/metas", label: "Carteira e metas", icon: Target },
  { href: "/painel/marcas", label: "Atendimentos por marca", icon: Tags, also: ["/painel/atendimentos"] },
  { href: "/painel/fotos", label: "Relatório fotográfico", icon: Camera },
  { href: "/painel/estoque", label: "Estoque e ruptura", icon: PackageSearch, also: ["/painel/rupturas", "/painel/validades", "/painel/avarias"] },
  { href: "/painel/promotores", label: "Promotores", icon: Users },
  { href: "/painel/pendencias", label: "Central de pendências", icon: ShieldAlert },
  { href: "/painel/degustacoes", label: "Degustações", icon: UtensilsCrossed },
  { href: "/painel/financeiro", label: "Financeiro", icon: Wallet, roles: ["admin"] },
];

const SETTINGS: NavItem[] = [
  { href: "/painel/programacao", label: "Programação", icon: CalendarRange, fullScope: true },
  { href: "/painel/roteiros", label: "Roteiros", icon: Route, fullScope: true },
  { href: "/painel/cadastros/marcas", label: "Marcas", icon: Tags, roles: ["admin"] },
  { href: "/painel/cadastros/lojas", label: "Redes e lojas", icon: Building2, roles: ["admin"] },
  { href: "/painel/cadastros/produtos", label: "Produtos", icon: Boxes, roles: ["admin"] },
  { href: "/painel/cadastros/parceiros", label: "Parceiros", icon: Handshake, roles: ["admin"] },
  { href: "/painel/cadastros/usuarios", label: "Usuários", icon: Users, roles: ["admin"] },
  { href: "/painel/cadastros/importar", label: "Importar planilha", icon: Upload, roles: ["admin"] },
  { href: "/painel/relatorios", label: "Exportações", icon: FileText },
  { href: "/painel/configuracoes", label: "Configurações", icon: Settings, roles: ["admin"] },
  { href: "/painel/auditoria", label: "Auditoria", icon: History, roles: ["admin"] },
];

const MCX_NAV: NavItem[] = [
  { href: "/painel/mcx", label: "Visão geral (todas)", icon: Globe2 },
  { href: "/painel/mcx/agencias", label: "Agências", icon: Building },
  { href: "/painel/mcx/escopos", label: "Escopos de clientes", icon: ClipboardCheck },
  { href: "/painel/mcx/melhorias", label: "Sugestões de melhorias", icon: Lightbulb },
  { href: "/painel/mcx/armazenamento", label: "Armazenamento", icon: HardDrive },
  { href: "/painel/mcx/equipe", label: "Equipe MCX", icon: UserCog },
];

function isActive(pathname: string, item: NavItem) {
  if (item.href === "/painel" || item.href === "/painel/mcx") return pathname === item.href;
  return [item.href, ...(item.also ?? [])].some((h) => pathname === h || pathname.startsWith(`${h}/`));
}

/**
 * Atualiza os dados da tela sem sair da conta (no app instalado não há o botão
 * de recarregar do navegador). Também atualiza sozinho ao voltar para o app
 * depois de 1 minuto fora.
 */
function SyncButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [at, setAt] = useState<Date | null>(null);
  const sync = useCallback(() => start(() => {
    router.refresh();
    setAt(new Date());
  }), [router]);
  useEffect(() => {
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 60_000) sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [sync]);
  return (
    <button
      type="button"
      onClick={sync}
      disabled={pending}
      className="w-full flex items-center gap-2.5 px-3 min-h-9 py-1.5 rounded-lg text-[13.5px] font-medium text-brand-100/80 hover:bg-white/6 hover:text-white disabled:opacity-80 transition-colors"
    >
      <RefreshCw className={clsx("size-4 shrink-0", pending && "animate-spin motion-reduce:animate-none")} />
      <span className="min-w-0 flex-1 text-left leading-tight">
        {pending ? "Atualizando…" : "Atualizar dados"}
        {at && !pending ? <span className="block text-[11px] font-normal text-brand-200/60">às {at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span> : null}
      </span>
    </button>
  );
}

function NavItemLink({ item, active, onNavigate, compact }: { item: NavItem; active: boolean; onNavigate?: () => void; compact?: boolean }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={clsx(
          "flex items-center gap-2.5 px-3 rounded-lg font-medium transition-colors",
          compact ? "min-h-8 py-1 text-[13px]" : "min-h-9 py-1.5 text-[13.5px]",
          active ? "bg-white/12 text-white" : "text-brand-100/80 hover:bg-white/6 hover:text-white",
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 leading-tight">{item.label}</span>
        {item.badge ? (
          <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-amber-400 text-brand-900 text-[11px] font-bold grid place-items-center" aria-label={`${item.badge} a revisar`}>
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function NavLinks({ role, fullScope, mcx, perms, owner, mcxBadges, hidden, onNavigate }: { role: Role; fullScope: boolean; mcx: boolean; perms: string[] | null; owner: boolean; mcxBadges: Record<string, number>; hidden: string[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const allowed = (i: NavItem) => {
    const mod = panelForPath(i.href);
    if (mod && hidden.includes(mod.key)) return false;
    if (perms) {
      // Perfis: só os painéis liberados para a pessoa.
      const panel = panelForPath(i.href);
      if (panel && !perms.includes(panel.key)) return false;
    }
    return (!i.roles || i.roles.includes(role)) && (!i.fullScope || fullScope);
  };
  if (mcx) {
    return (
      <nav>
        <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-200/60">MCX</p>
        <ul className="space-y-0.5">
          {MCX_NAV.filter((i) => owner || i.href !== "/painel/mcx/equipe").map((item) => (
            <NavItemLink key={item.href} item={{ ...item, badge: mcxBadges[item.href] }} active={isActive(pathname, item)} onNavigate={onNavigate} />
          ))}
        </ul>
      </nav>
    );
  }
  const settings = SETTINGS.filter(allowed);
  const settingsActive = settings.some((i) => isActive(pathname, i));
  return (
    <nav className="space-y-4">
      <ul className="space-y-0.5">
        {MAIN.filter(allowed).map((item) => (
          <NavItemLink key={item.href} item={item} active={isActive(pathname, item)} onNavigate={onNavigate} />
        ))}
      </ul>
      {settings.length ? (
        <details open={settingsActive} className="group">
          <summary className="list-none cursor-pointer flex items-center gap-2.5 h-9 px-3 rounded-lg text-[13.5px] font-medium text-brand-100/80 hover:bg-white/6 hover:text-white [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="size-4 shrink-0" />
            <span className="flex-1">Cadastros e configurações</span>
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="mt-0.5 ml-3 pl-2 border-l border-white/10 space-y-0.5">
            {settings.map((item) => (
              <NavItemLink key={item.href} item={item} active={isActive(pathname, item)} onNavigate={onNavigate} compact />
            ))}
          </ul>
        </details>
      ) : null}
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
  /** Sugestões de melhoria recebidas e ainda não avaliadas (contador no menu MCX). */
  improvementsToReview: number;
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
  allowed,
  hidden = [],
  owner,
  scopeNote,
  logout,
  children,
}: {
  hidden?: string[];
  user: { name: string; role: Role };
  agency: { id: string; name: string; logoUrl: string | null } | null;
  platform: PlatformProps | null;
  fullScope: boolean;
  allowed: string[] | null;
  owner: boolean;
  scopeNote: string | null;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const mcx = Boolean(platform) && (pathname.startsWith("/painel/mcx") || !agency);
  const brand = mcx || !agency ? <BrandMark name="Equipe MCX" logoUrl="/mcx_logo.png" subtitle="Visão das agências" /> : <BrandMark name={agency.name} logoUrl={agency.logoUrl} />;
  const sidebar = (onNavigate?: () => void) => (
    <>
      {platform ? <AgencySwitcher platform={platform} current={mcx ? null : agency?.id ?? null} onNavigate={onNavigate} /> : null}
      <div className="flex-1 overflow-y-auto">
        <NavLinks
          role={user.role}
          fullScope={fullScope}
          mcx={mcx}
          perms={allowed}
          hidden={hidden}
          owner={owner}
          mcxBadges={{ "/painel/mcx/melhorias": platform?.improvementsToReview ?? 0 }}
          onNavigate={onNavigate}
        />
      </div>
      <ul className="mb-2">
        <li>
          <SyncButton />
        </li>
        <NavItemLink item={{ href: "/painel/melhorias", label: "Sugerir melhoria", icon: Lightbulb }} active={pathname === "/painel/melhorias"} onNavigate={onNavigate} />
      </ul>
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
        {children}
      </main>
    </div>
  );
}
