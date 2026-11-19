/**
 * Envio em duas etapas (fotos, depois o texto). Em alguns celulares o WhatsApp repete o
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

export const SPLIT_SHARE_LABEL = "Enviar o texto separado das fotos";
export const SPLIT_SHARE_HINT = "Marque se, no grupo, cada foto está saindo com o relatório repetido.";
export const SPLIT_SHARE_NEXT = "Fotos enviadas. Agora toque em ENVIAR O TEXTO e escolha o mesmo grupo.";
