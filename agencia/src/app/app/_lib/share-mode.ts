/**
 * Fotos sem texto, com o relatório copiado para colar na legenda (um envio só). Em alguns celulares o WhatsApp repete o
 * texto em cada foto e desfaz o álbum quando fotos e texto vão juntos para um grupo.
 * A escolha fica guardada no aparelho do promotor.
 */
const KEY = "mcx.share.split";

export function readSplitShare(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSplitShare(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento: vale só nesta tela */
  }
}

export const SPLIT_SHARE_LABEL = "Enviar só as fotos e colar o relatório";
export const SPLIT_SHARE_HINT = "Marque se, no grupo, cada foto está saindo com o relatório repetido. O relatório fica copiado: no WhatsApp, antes de enviar, segure no campo \"Adicione uma legenda\" e toque em Colar.";
export const SPLIT_SHARE_NEXT = "Relatório copiado. No WhatsApp, cole no campo da legenda antes de enviar.";
