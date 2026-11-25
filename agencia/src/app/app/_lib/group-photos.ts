/**
 * Padrão do envio no grupo da loja: vão só as fotos do DEPOIS, até 10 (o compartilhar do
 * Chrome no Android recusa tudo acima de 10 arquivos), na ordem em que foram tiradas.
 * As fotos do antes — e todas as do depois — ficam no relatório completo (link/PDF),
 * separadas em Antes e Depois. A mensagem avisa que as do antes estão no relatório.
 */
export const GROUP_MAX_FILES = 10;

type Taken = { kind: string; takenAt: string };

export function groupPhotos<T extends Taken>(photos: T[], max = GROUP_MAX_FILES): { sent: T[]; hasBefore: boolean; afterLeft: number } {
  const after = photos.filter((p) => p.kind === "after").sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  const sent = after.slice(0, Math.max(0, max));
  return { sent, hasBefore: photos.some((p) => p.kind === "before"), afterLeft: after.length - sent.length };
}

/** Texto para o promotor, embaixo do botão de envio. */
export function groupSendHint(sentCount: number, afterLeft: number, hasBefore: boolean): string {
  const head = `Vão ${sentCount} foto${sentCount === 1 ? "" : "s"} do DEPOIS para o grupo.`;
  if (afterLeft > 0) return `${head} As outras ${afterLeft} do depois${hasBefore ? " e as do antes" : ""} ficam no relatório.`;
  return hasBefore ? `${head} As do antes ficam no relatório.` : head;
}

/** Linha padrão da mensagem do grupo quando o atendimento tem fotos do antes. */
export const BEFORE_IN_REPORT_NOTE = "📷 As fotos do ANTES estão no relatório completo.";

/** Limite escolhido pela agência (1 a 10); valor ausente ou inválido = o máximo. */
export function groupLimit(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(GROUP_MAX_FILES, Math.max(1, Math.round(v))) : GROUP_MAX_FILES;
}

/** Aviso no fim da mensagem do grupo: o que não foi como foto está no relatório completo. */
export function groupReportNote(hasBefore: boolean, afterLeft: number): string | null {
  if (afterLeft > 0) return hasBefore ? "📷 As fotos do ANTES e as demais do DEPOIS estão no relatório completo." : "📷 As demais fotos do DEPOIS estão no relatório completo.";
  return hasBefore ? BEFORE_IN_REPORT_NOTE : null;
}
