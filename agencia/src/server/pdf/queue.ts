/**
 * Fila dos relatórios pesados (PDF e PowerPoint com fotos): o servidor monta UM por vez.
 * Vários relatórios ao mesmo tempo somavam as fotos de todos na memória e derrubavam o
 * serviço (502). Quem chega depois espera a vez; se a espera passar de MAX_WAIT_MS (um
 * relatório travado), segue assim mesmo — a fila nunca bloqueia o relatório para sempre.
 */
const MAX_WAIT_MS = 45_000;
let tail: Promise<void> = Promise.resolve();

export function pdfSlot<T>(fn: () => Promise<T>, maxWaitMs = MAX_WAIT_MS): Promise<T> {
  const prev = tail;
  let release!: () => void;
  tail = new Promise<void>((r) => (release = r));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((r) => {
    timer = setTimeout(r, maxWaitMs);
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([prev, timeout])
    .then(() => {
      clearTimeout(timer);
      return fn();
    })
    .finally(release);
}

/** No máximo `limit` tarefas ao mesmo tempo (download das fotos do relatório). */
export function limiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((r) => waiting.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}
