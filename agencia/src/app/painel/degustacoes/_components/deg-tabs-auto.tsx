/** Abas do menu Degustações com o vocabulário da agência (modo ações: Promotoras, Painel da agenda). */
import { getScope } from "@/server/auth";
import { DegTabs as Tabs } from "./deg-tabs";

export async function DegTabs({ actions }: { actions?: boolean } = {}) {
  const on = actions ?? (await getScope()).settings.modules.actions;
  return <Tabs actions={on} />;
}
