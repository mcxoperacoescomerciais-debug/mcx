"use client";

/**
 * Telas da visita: hub "Como está a loja?", listas por seção, conferência e
 * conclusão. Todas leem e gravam só no estado local (funcionam sem sinal).
 */
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileText,
  MessageSquareText,
  PackageX,
  Share2,
  ShieldAlert,
  Store,
} from "lucide-react";
import clsx from "clsx";
import { BottomBar, TopBar } from "./primitives";
import { MissingVisit, sectionItems, storeTitle, useSeverityOf, type Section } from "./visit-common";
import { SeverityBadge } from "@/components/ui";
import { formatIsoBr } from "@/lib/validity";
import { chooseStoreFormat, discardVisit, finishVisit, isVisitFullySynced, reopenVisit, setVisitFields, syncNow, type LocalVisit } from "../_lib/local-store";
import { back, go, haptic, needsFormatChoice, useCatalog, useLocal, useVisit } from "../_lib/hooks";
import { FormatSheet } from "./format-sheet";
import { STORE_FORMAT_LABEL, type StoreFormat } from "@/lib/domain";

// ───────────────────────────── Hub ─────────────────────────────

export function VisitHub({ visitId }: { visitId: string }) {
  const visit = useVisit(visitId);
  const { storeById } = useCatalog();
  const sev = useSeverityOf();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [choosingFormat, setChoosingFormat] = useState(false);
  const finished = visit?.status === "finished";
  useEffect(() => {
    if (finished) go(`visita/${visitId}/ok`, true);
  }, [finished, visitId]);
  if (!visit) return <MissingVisit />;
  if (finished) return null;
  const store = storeById.get(visit.storeId);
  const counts = {
    validade: sectionItems(visit, "validade"),
    estoque: sectionItems(visit, "estoque"),
    ruptura: sectionItems(visit, "ruptura"),
    avaria: sectionItems(visit, "avaria"),
  };
  const urgent = [...counts.validade, ...counts.estoque].filter((o) => {
    const s = sev(o, visit.visitDate)?.severity;
    return s === "expired" || s === "critical";
  }).length;
  const started = new Date(visit.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const tiles: { key: string; label: string; hint: string; icon: typeof Store; count: number | null; href: string }[] = [
    { key: "validade", label: "Validades", hint: "Área de vendas", icon: CalendarClock, count: counts.validade.length, href: "validade" },
    { key: "estoque", label: "Estoque", hint: "Validade no estoque", icon: Archive, count: counts.estoque.length, href: "estoque" },
    { key: "ruptura", label: "Ruptura", hint: "Produto em falta", icon: PackageX, count: counts.ruptura.length, href: "ruptura" },
    { key: "avaria", label: "Avaria", hint: "Produto danificado", icon: ShieldAlert, count: counts.avaria.length, href: "avaria" },
    { key: "obs", label: "Observação", hint: visit.notes ? "Adicionada" : "Geral da visita", icon: MessageSquareText, count: null, href: "obs" },
  ];

  return (
    <div className="min-h-dvh pb-28">
      <TopBar title={storeTitle(store)} subtitle={`${store?.city ?? ""} · visita iniciada às ${started}`} onBack={() => go("", true)} />
      <div className="max-w-xl mx-auto px-4 pt-5">
        <h1 className="text-[22px] font-semibold text-ink">Como está a loja?</h1>
        <p className="text-[14px] text-muted mt-0.5">Toque em uma seção para registrar. Pode registrar várias.</p>

        {store && (store.formatOptions?.length ?? 0) > 1 ? (
          <button
            type="button"
            onClick={() => setChoosingFormat(true)}
            className={clsx(
              "mt-4 w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-left",
              needsFormatChoice(store) ? "bg-gold-100 border border-gold-400/50" : "bg-surface border border-line",
            )}
          >
            <span className="text-[14px] text-ink">
              Tipo da loja:{" "}
              <b>{store.format ? `${store.network} ${STORE_FORMAT_LABEL[store.format as StoreFormat] ?? store.format}` : "toque para definir"}</b>
            </span>
            <span className="text-[13px] font-semibold text-navy-700">{store.format ? "Trocar" : "Definir"}</span>
          </button>
        ) : null}
        <FormatSheet
          store={choosingFormat ? (store ?? null) : null}
          onClose={() => setChoosingFormat(false)}
          onChoose={(f) => {
            setChoosingFormat(false);
            void chooseStoreFormat(visit.storeId, f);
          }}
        />

        {urgent > 0 ? (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-[#FDECEC] text-[#8E1B1B] px-3.5 py-3">
            <AlertTriangle className="size-5 shrink-0" />
            <p className="text-[14px] font-semibold">
              {urgent} {urgent === 1 ? "item vencido ou crítico" : "itens vencidos ou críticos"} nesta visita
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 mt-4">
          {tiles.map((t, i) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => go(`visita/${visitId}/${t.href}`)}
                className={clsx(
                  "relative text-left rounded-2xl bg-surface border border-line p-4 shadow-[var(--shadow-card)] active:bg-navy-50 min-h-[118px] flex flex-col",
                  i === 0 && "col-span-2 min-h-[96px] flex-row items-center gap-4",
                )}
              >
                <span className={clsx("grid place-items-center rounded-xl bg-navy-50 text-navy-800", i === 0 ? "size-14" : "size-11")}>
                  <Icon className={i === 0 ? "size-7" : "size-6"} />
                </span>
                <span className={clsx(i === 0 ? "flex-1" : "mt-auto pt-3")}>
                  <span className="block text-[16px] font-semibold text-ink">{t.label}</span>
                  <span className="block text-[12.5px] text-muted">{t.hint}</span>
                </span>
                {t.count !== null && t.count > 0 ? (
                  <span className="absolute top-3 right-3 min-w-7 h-7 px-2 rounded-full bg-navy-900 text-white text-[13px] font-bold grid place-items-center tnum">
                    {t.count}
                  </span>
                ) : t.key === "obs" && visit.notes ? (
                  <Check className="absolute top-3.5 right-3.5 size-5 text-[#2F9E5B]" />
                ) : null}
              </button>
            );
          })}
        </div>

        {Object.keys(visit.occurrences).length === 0 ? (
          <div className="mt-6 text-center">
            {confirmDiscard ? (
              <div className="rounded-xl border border-line bg-surface p-4">
                <p className="text-[14px] text-ink-2">Cancelar esta visita? Nada foi registrado ainda.</p>
                <div className="flex gap-2 justify-center mt-3">
                  <button type="button" onClick={() => setConfirmDiscard(false)} className="h-10 px-4 rounded-lg border border-line-strong font-semibold text-[14px]">
                    Não
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await discardVisit(visitId);
                      go("lojas", true);
                    }}
                    className="h-10 px-4 rounded-lg bg-[#B42318] text-white font-semibold text-[14px]"
                  >
                    Sim, cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDiscard(true)} className="text-[13px] text-muted underline underline-offset-2">
                Iniciei a visita na loja errada
              </button>
            )}
          </div>
        ) : null}
      </div>
      <BottomBar>
        <button
          type="button"
          onClick={() => go(`visita/${visitId}/conferir`)}
          className="h-14 flex-1 rounded-2xl bg-gold-500 text-navy-950 font-bold text-[16px] inline-flex items-center justify-center gap-2 active:bg-gold-600"
        >
          <ClipboardCheck className="size-5" /> Finalizar visita
        </button>
      </BottomBar>
    </div>
  );
}

// ───────────────────────────── Observação ─────────────────────────────

const QUICK_NOTES = [
  "Gerente da loja informado.",
  "Produtos próximos ao vencimento separados para rebaixa.",
  "Produto retirado da área de vendas.",
  "Câmara fria com temperatura irregular.",
  "Sem espaço na gôndola.",
];

export function NotesScreen({ visitId }: { visitId: string }) {
  const visit = useVisit(visitId);
  const { storeById } = useCatalog();
  const [text, setText] = useState(visit?.notes ?? "");
  if (!visit) return <MissingVisit />;
  const save = async () => {
    await setVisitFields(visitId, { notes: text.trim() });
    haptic();
    back(`visita/${visitId}`);
  };
  return (
    <div className="min-h-dvh pb-28">
      <TopBar title="Observação geral" subtitle={storeTitle(storeById.get(visit.storeId))} onBack={() => void save()} />
      <div className="max-w-xl mx-auto px-4 pt-4 space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          autoFocus
          placeholder="Algo importante sobre a loja nesta visita…"
          className="w-full rounded-2xl border border-line-strong p-4 text-[16px] bg-surface focus:border-navy-700 focus:outline-none focus:ring-4 focus:ring-navy-100"
        />
        <p className="text-[13px] font-semibold text-muted">Frases rápidas</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_NOTES.map((n) => (
            <button key={n} type="button" onClick={() => setText((t) => (t ? `${t.trim()} ${n}` : n))} className="px-3 py-2 rounded-full border border-line-strong text-[13px] text-ink-2 bg-surface active:bg-navy-50">
              + {n}
            </button>
          ))}
        </div>
      </div>
      <BottomBar>
        <button type="button" onClick={() => void save()} className="h-14 flex-1 rounded-2xl bg-navy-900 text-white font-semibold text-[16px]">
          Salvar observação
        </button>
      </BottomBar>
    </div>
  );
}

// ───────────────────────────── Conferência ─────────────────────────────

const CHECKLIST_SECTION: Record<string, (v: LocalVisit) => boolean> = {
  sales_floor: (v) => sectionItems(v, "validade").length > 0,
  stock: (v) => sectionItems(v, "estoque").length > 0,
  validity: (v) => sectionItems(v, "validade").length + sectionItems(v, "estoque").length > 0,
  rupture: (v) => sectionItems(v, "ruptura").length > 0,
  damage: (v) => sectionItems(v, "avaria").length > 0,
};

export function ReviewScreen({ visitId }: { visitId: string }) {
  const visit = useVisit(visitId);
  const { bootstrap } = useLocal();
  const { storeById, productById } = useCatalog();
  const sev = useSeverityOf();
  const [busy, setBusy] = useState(false);
  if (!visit) return <MissingVisit />;
  const store = storeById.get(visit.storeId);
  const checklist = bootstrap?.checklist ?? [];
  // Seção com registro conta como verificada automaticamente; as vazias pedem confirmação explícita.
  const isChecked = (key: string) => visit.checklist[key] === true || (CHECKLIST_SECTION[key]?.(visit) ?? false);
  const allChecked = checklist.every((c) => isChecked(c.key));
  const toggle = (key: string) => void setVisitFields(visitId, { checklist: { ...visit.checklist, [key]: !visit.checklist[key] } });

  const rows: [string, number, Section | "obs"][] = [
    ["Validades na área de vendas", sectionItems(visit, "validade").length, "validade"],
    ["Validades no estoque", sectionItems(visit, "estoque").length, "estoque"],
    ["Rupturas", sectionItems(visit, "ruptura").length, "ruptura"],
    ["Avarias", sectionItems(visit, "avaria").length, "avaria"],
  ];
  const urgent = Object.values(visit.occurrences)
    .map((o) => ({ o, s: sev(o, visit.visitDate) }))
    .filter(({ s }) => s && (s.severity === "expired" || s.severity === "critical"))
    .sort((a, b) => a.s!.days - b.s!.days);
  const photos = Object.values(visit.occurrences).reduce((n, o) => n + o.photos.length, 0);

  return (
    <div className="min-h-dvh pb-28">
      <TopBar title="Conferência" subtitle={storeTitle(store)} onBack={() => back(`visita/${visitId}`)} />
      <div className="max-w-xl mx-auto px-4 pt-4 space-y-5">
        <div className="rounded-2xl bg-navy-900 text-white p-4">
          <p className="text-[12px] uppercase tracking-[0.18em] text-gold-400 font-semibold">Resumo da visita</p>
          <p className="text-[18px] font-semibold mt-1">{storeTitle(store)}</p>
          <p className="text-[13px] text-silver-300">
            {store?.city} – {store?.state} · {formatIsoBr(visit.visitDate)} · {new Date(visit.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>

        <ul className="rounded-2xl bg-surface border border-line divide-y divide-line">
          {rows.map(([label, n, href]) => (
            <li key={label}>
              <button type="button" onClick={() => go(`visita/${visitId}/${href}`)} className="w-full px-4 py-3 flex items-center justify-between active:bg-navy-50">
                <span className="text-[15px] text-ink">{label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-[17px] font-bold tnum">{n}</span>
                  <ChevronRight className="size-4 text-muted" />
                </span>
              </button>
            </li>
          ))}
          <li className="px-4 py-3 flex items-center justify-between text-[14px] text-muted">
            <span>Fotos · Observação</span>
            <span>
              {photos} · {visit.notes ? "sim" : "não"}
            </span>
          </li>
        </ul>

        {urgent.length ? (
          <section>
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#B42318] mb-2">Atenção imediata</h2>
            <ul className="rounded-2xl bg-surface border border-[#F3B8B8] divide-y divide-line">
              {urgent.map(({ o, s }) => (
                <li key={o.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-[14px] font-medium">
                    {productById.get(o.productId)?.name} <span className="text-muted">· {o.quantity} {o.unit}</span>
                  </span>
                  <SeverityBadge severity={s!.severity} days={s!.days} size="sm" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-1">Checklist</h2>
          <p className="text-[13px] text-muted mb-2">Confirme o que foi verificado, mesmo sem ocorrência.</p>
          <ul className="rounded-2xl bg-surface border border-line divide-y divide-line">
            {checklist.map((c) => {
              const auto = CHECKLIST_SECTION[c.key]?.(visit) ?? false;
              const checked = isChecked(c.key);
              return (
                <li key={c.key}>
                  <button type="button" disabled={auto} onClick={() => toggle(c.key)} className="w-full px-4 py-3.5 flex items-center gap-3 text-left">
                    <span className={clsx("size-6 rounded-md border-2 grid place-items-center", checked ? "bg-[#2F9E5B] border-[#2F9E5B] text-white" : "border-line-strong")}>
                      {checked ? <Check className="size-4" strokeWidth={3} /> : null}
                    </span>
                    <span className="flex-1 text-[15px]">{c.label}</span>
                    {auto ? <span className="text-[11px] text-muted">com registro</span> : checked ? <span className="text-[11px] text-muted">sem ocorrência</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <BottomBar>
        <button
          type="button"
          disabled={!allChecked || busy}
          onClick={async () => {
            setBusy(true);
            await finishVisit(visitId);
            haptic(40);
            go(`visita/${visitId}/ok`, true);
          }}
          className={clsx("h-14 flex-1 rounded-2xl font-bold text-[16px]", allChecked ? "bg-gold-500 text-navy-950" : "bg-navy-100 text-muted")}
        >
          {allChecked ? "Finalizar visita" : "Confirme o checklist"}
        </button>
      </BottomBar>
    </div>
  );
}

// ───────────────────────────── Concluída ─────────────────────────────

export function DoneScreen({ visitId }: { visitId: string }) {
  const visit = useVisit(visitId);
  const { storeById } = useCatalog();
  const { sync, bootstrap } = useLocal();
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [openedAt] = useState(() => Date.now());
  if (!visit) return <MissingVisit />;
  const store = storeById.get(visit.storeId);
  // Mensagem que acompanha o PDF no grupo do WhatsApp (sem link, só o arquivo).
  const shareText = [
    "Relatório de visita SUINCO",
    `Promotor: ${bootstrap?.user.name ?? ""}`,
    `Loja: ${storeTitle(store)}`,
    `Cidade: ${store?.city ?? ""}`,
  ].join("\n");
  const dataSent = visit.rev === visit.syncedRev;
  const pendingPhotos = Object.values(visit.occurrences).reduce((n, o) => n + o.photos.filter((p) => !p.uploaded).length, 0);
  // O PDF só é liberado com as fotos já no servidor; senão ele sairia sem elas.
  const ready = dataSent && isVisitFullySynced(visit);
  const pdfUrl = `/api/visits/${visitId}/pdf`;
  const editable = visit.finishedAt && openedAt - new Date(visit.finishedAt).getTime() < 24 * 3_600_000;

  async function share() {
    setSharing(true);
    setShareError(null);
    try {
      const res = await fetch(pdfUrl);
      if (!res.ok) throw new Error();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "relatorio-visita.pdf";
      const file = new File([await res.blob()], name, { type: "application/pdf" });
      // A mensagem também vai para a área de transferência: se o WhatsApp não
      // mostrar o texto junto do PDF, o promotor só cola na conversa.
      try {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
      } catch {
        /* sem permissão de área de transferência */
      }
      if (navigator.canShare?.({ files: [file], text: shareText })) {
        await navigator.share({ files: [file], text: shareText, title: "Relatório de visita SUINCO" });
      } else if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Relatório de visita SUINCO" });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = name;
        a.click();
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setShareError("Não foi possível gerar o PDF agora. Tente de novo.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="min-h-dvh bg-navy-900 text-white flex flex-col">
      <div className="flex-1 max-w-xl w-full mx-auto px-5 pt-[calc(env(safe-area-inset-top)+48px)] pb-6 flex flex-col">
        <div className="size-16 rounded-full bg-[#2F9E5B] grid place-items-center">
          <CheckCircle2 className="size-9" />
        </div>
        <h1 className="text-[26px] font-semibold mt-5">Visita registrada</h1>
        <p className="text-silver-300 mt-1">
          {storeTitle(store)} · {formatIsoBr(visit.visitDate)}
        </p>

        <div className="mt-6 rounded-2xl bg-white/8 border border-white/10 p-4 text-[14px]">
          {ready ? (
            <p className="flex items-center gap-2">
              <Check className="size-4 text-[#7BE0A3]" /> Dados e fotos enviados ao sistema
            </p>
          ) : dataSent ? (
            <p className="text-[#FFD7B5]">
              Dados enviados. Enviando {pendingPhotos} {pendingPhotos === 1 ? "foto" : "fotos"}… o PDF fica pronto assim que terminar.
            </p>
          ) : (
            <p className="text-[#FFD7B5]">
              {sync.online ? "Enviando dados…" : "Sem sinal: os dados estão salvos no celular e serão enviados assim que houver conexão."}
            </p>
          )}
        </div>

        <div className="mt-auto space-y-2.5 pt-8">
          <button
            type="button"
            disabled={!ready || sharing}
            onClick={() => void share()}
            className="w-full h-14 rounded-2xl bg-gold-500 text-navy-950 font-bold text-[16px] inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Share2 className="size-5" /> {sharing ? "Gerando PDF…" : ready ? "Enviar PDF no WhatsApp" : dataSent ? "Aguardando as fotos…" : "Aguardando sinal para gerar o PDF"}
          </button>
          {shareError ? <p className="text-[13px] text-[#FFB4B4] text-center">{shareError}</p> : null}
          {ready ? (
            <div className="rounded-xl bg-white/8 border border-white/10 px-3 py-2.5 text-[12.5px] text-silver-300">
              <p className="font-semibold text-white mb-0.5">Mensagem que vai junto do PDF{copied ? " (copiada)" : ""}:</p>
              <p className="whitespace-pre-line">{shareText}</p>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2.5">
            <a
              href={ready ? pdfUrl : undefined}
              aria-disabled={!ready}
              className={clsx("h-12 rounded-xl border border-white/20 font-semibold text-[14px] inline-flex items-center justify-center gap-2", !ready && "opacity-40 pointer-events-none")}
            >
              <Download className="size-4" /> Baixar PDF
            </a>
            <a
              href={ready ? `${pdfUrl}?inline=1` : undefined}
              target="_blank"
              rel="noreferrer"
              className={clsx("h-12 rounded-xl border border-white/20 font-semibold text-[14px] inline-flex items-center justify-center gap-2", !ready && "opacity-40 pointer-events-none")}
            >
              <FileText className="size-4" /> Ver relatório
            </a>
          </div>
          <button type="button" onClick={() => go("lojas", true)} className="w-full h-12 rounded-xl bg-white text-navy-900 font-semibold text-[15px]">
            Nova visita
          </button>
          {editable ? (
            <button
              type="button"
              onClick={async () => {
                await reopenVisit(visitId);
                void syncNow();
                go(`visita/${visitId}`, true);
              }}
              className="w-full h-10 text-[13px] text-silver-300 underline underline-offset-2"
            >
              Corrigir esta visita
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
