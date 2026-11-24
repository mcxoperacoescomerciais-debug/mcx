/**
 * Google Agenda dentro da aba do Notion: o sistema só mostra a agenda do
 * Google (incorporação oficial em iframe). Não lê nem grava eventos e não
 * guarda senha ou token: quem vê os compromissos é a conta Google que está
 * logada no navegador, com as permissões que ela já tem.
 */

export type CalendarMode = "WEEK" | "MONTH" | "AGENDA";
export const CALENDAR_MODES: { mode: CalendarMode; label: string }[] = [
  { mode: "WEEK", label: "Semana" },
  { mode: "MONTH", label: "Mês" },
  { mode: "AGENDA", label: "Lista" },
];

export interface CalendarEntry {
  /** ID da agenda no Google (o e-mail da conta ou ...@group.calendar.google.com). */
  id: string;
  /** Nome para a tela (ex.: "Maria", "Comercial"). */
  label: string;
}

export interface CalendarConfig {
  calendars: CalendarEntry[];
}

const ID = /^[a-z0-9._%+#-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const MAX = 10;

/**
 * Lê o que a pessoa colou: o ID ("fulano@gmail.com"), o link de incorporação
 * ("…/calendar/embed?src=…") ou o endereço público ("…?cid=…"). Devolve o ID
 * ou null se não for uma agenda reconhecível.
 */
export function parseCalendarId(raw: string): string | null {
  let v = raw.trim().replace(/^<iframe[^>]*src="([^"]+)".*$/i, "$1");
  if (/^https?:\/\//i.test(v)) {
    try {
      const url = new URL(v.replace(/&amp;/g, "&"));
      v = url.searchParams.get("src") ?? url.searchParams.get("cid") ?? "";
      if (v && !v.includes("@")) {
        // "cid" às vezes vem em base64.
        try {
          const decoded = typeof atob === "function" ? atob(v) : Buffer.from(v, "base64").toString("utf8");
          if (ID.test(decoded)) v = decoded;
        } catch {
          /* não era base64 */
        }
      }
    } catch {
      return null;
    }
  }
  try {
    v = decodeURIComponent(v);
  } catch {
    /* fica como veio */
  }
  v = v.trim().toLowerCase();
  return ID.test(v) ? v : null;
}

/**
 * Uma linha por agenda: "Nome: id" ou só o id/link. Linhas que não forem
 * agenda voltam em `invalid` para a tela avisar (nada é salvo pela metade).
 */
export function parseCalendarLines(text: string): { calendars: CalendarEntry[]; invalid: string[] } {
  const calendars: CalendarEntry[] = [];
  const invalid: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    const m = /^([^:/@]{1,40}):\s*(.+)$/.exec(raw);
    const label = m ? m[1].trim() : "";
    const id = parseCalendarId(m ? m[2] : raw);
    if (!id) {
      invalid.push(raw);
      continue;
    }
    if (calendars.some((c) => c.id === id)) continue;
    calendars.push({ id, label: label || id.split("@")[0] });
  }
  return { calendars: calendars.slice(0, MAX), invalid };
}

export function normalizeCalendarConfig(value: unknown): CalendarConfig {
  const list = (value as { calendars?: unknown })?.calendars;
  if (!Array.isArray(list)) return { calendars: [] };
  const calendars: CalendarEntry[] = [];
  for (const c of list) {
    const id = typeof c?.id === "string" ? parseCalendarId(c.id) : null;
    if (!id || calendars.some((x) => x.id === id)) continue;
    const label = typeof c?.label === "string" && c.label.trim() ? c.label.trim().slice(0, 40) : id.split("@")[0];
    calendars.push({ id, label });
  }
  return { calendars: calendars.slice(0, MAX) };
}

export function calendarLines(config: CalendarConfig): string {
  return config.calendars.map((c) => `${c.label}: ${c.id}`).join("\n");
}

/** Cores do Google para diferenciar as agendas na mesma tela. */
const COLORS = ["#039BE5", "#33B679", "#E67C73", "#F6BF26", "#8E24AA", "#F4511E", "#0B8043", "#3F51B5", "#7986CB", "#616161"];

export function embedUrl(calendars: CalendarEntry[], mode: CalendarMode = "WEEK"): string | null {
  if (!calendars.length) return null;
  const p = new URLSearchParams({ ctz: "America/Sao_Paulo", hl: "pt_BR", mode, wkst: "1", showPrint: "0", showTitle: "0", showTz: "0" });
  calendars.forEach((c, i) => {
    p.append("src", c.id);
    p.append("color", COLORS[i % COLORS.length]);
  });
  return `https://calendar.google.com/calendar/embed?${p.toString()}`;
}

/** Abre o Google Agenda (para criar ou editar compromissos). */
export const OPEN_URL = "https://calendar.google.com/calendar/r";

export function parseMode(value: unknown): CalendarMode {
  return value === "MONTH" || value === "AGENDA" ? value : "WEEK";
}
