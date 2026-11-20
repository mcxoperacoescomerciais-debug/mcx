import Link from "next/link";
import { ActivityBeacon } from "@/components/activity-beacon";
import { NavLinks } from "@/components/nav-links";
import { QuickCapture } from "@/components/quick-capture";
import { todayIso } from "@/lib/dates";
import { ROLE_LABEL } from "@/lib/domain";
import { NAV } from "@/lib/nav";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { formOptions } from "@/server/demands";
import { runRoutinesOncePerDay } from "@/server/routines";
import { activeTimer } from "@/server/time";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = NAV.filter((n) => !n.needs || can(user.role, n.needs));
  // Garantia além do cron: na primeira abertura do dia, gera as rotinas devidas (idempotente).
  await runRoutinesOncePerDay().catch((err) => console.error("[rotinas]", err));
  const [options, timer] = await Promise.all([formOptions(), activeTimer(user.id)]);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="bg-brand-900 pt-[env(safe-area-inset-top)] text-white lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 lg:block lg:py-5">
          <Link href="/" className="block">
            <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand-200">MCX</span>
            <span className="text-lg font-bold">Operações</span>
          </Link>
          <p className="text-right text-xs text-brand-200 lg:mt-3 lg:text-left">
            <span className="block font-semibold text-white">{user.name}</span>
            {ROLE_LABEL[user.role]} ·{" "}
            <Link href="/senha" className="underline-offset-2 hover:underline">Senha</Link> ·{" "}
            <a href="/sair" className="underline-offset-2 hover:underline">Sair</a>
          </p>
        </div>
        <NavLinks items={items} />
      </aside>
      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-28 pt-5 lg:px-8 lg:pt-8">
        {timer && (
          <p className="mb-4 rounded-lg bg-info-bg px-3 py-2 text-sm text-info">
            Cronômetro rodando em{" "}
            <Link href={`/demandas/${timer.demandId}`} className="font-semibold underline underline-offset-2">{timer.title}</Link>
          </p>
        )}
        {children}
      </main>
      <ActivityBeacon />
      <QuickCapture options={options} userId={user.id} today={todayIso()} />
    </div>
  );
}
