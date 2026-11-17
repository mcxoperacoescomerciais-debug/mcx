/**
 * Padrão do envio no grupo da loja: vão só as fotos do DEPOIS, até 10 (o compartilhar do
 * Chrome no Android recusa tudo acima de 10 arquivos), na ordem em que foram tiradas.
 * As fotos do antes — e todas as do depois — ficam no relatório completo (link/PDF),
 * separadas em Antes e Depois. A mensagem avisa que as do antes estão no relatório.
 */
export const GROUP_MAX_FILES = 10;

type Taken = { kind: string; takenAt: string };

export function groupPhotos<T extends Taken>(photos: T[], max = GROUP_MAX_FILES): { sent: T[]; hasBefore: boolean } {
  const after = photos.filter((p) => p.kind === "after").sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  return { sent: after.slice(0, Math.max(0, max)), hasBefore: photos.some((p) => p.kind === "before") };
}

/** Linha padrão da mensagem do grupo quando o atendimento tem fotos do antes. */
export const BEFORE_IN_REPORT_NOTE = "📷 As fotos do ANTES estão no relatório completo.";
