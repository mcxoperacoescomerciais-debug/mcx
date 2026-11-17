/**
 * O compartilhar do Chrome no Android aceita no máximo 10 arquivos por envio (acima disso
 * recusa tudo). Regra: as 10 primeiras fotos do antes/depois, na ordem em que foram tiradas,
 * vão no grupo; as que passarem disso ficam só no relatório (e a mensagem avisa).
 */
export const GROUP_MAX_FILES = 10;

type Taken = { kind: string; takenAt: string };

export function groupPhotos<T extends Taken>(photos: T[], max = GROUP_MAX_FILES): { sent: T[]; total: number; left: number } {
  const ba = photos.filter((p) => p.kind === "before" || p.kind === "after").sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  const sent = ba.slice(0, Math.max(0, max));
  return { sent, total: ba.length, left: ba.length - sent.length };
}

/** Linha da mensagem quando parte das fotos ficou só no relatório. */
export function groupPhotosNote(sentCount: number, total: number): string | null {
  const left = total - sentCount;
  if (left <= 0) return null;
  return `📷 ${sentCount} de ${total} fotos enviadas aqui. As outras ${left} estão só no relatório completo.`;
}
