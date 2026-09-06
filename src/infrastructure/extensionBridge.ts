// A ponte com a extensão do navegador (pasta `extension/`): uma página web não
// bloqueia site nenhum, então o app só AVISA — um evento no `window`, com o
// estado do hardcore em JSON — e o content script da extensão repassa pro
// service worker, que aplica as regras. A extensão se anuncia com um atributo no
// <html>; é assim que Configurações diz "instalada" ou "não encontrada".
// Sem `window` (Node), tudo é no-op.

import type { Unsubscribe } from './ports';

/** App → extensão: o estado atual (a cada mudança, e em resposta à pergunta). */
export const EXT_STATE_EVENT = 'study-pets:hardcore';
/** Extensão → app: "qual é o estado agora?" (ao carregar o content script). */
export const EXT_QUERY_EVENT = 'study-pets:hardcore?';
/** O atributo que o content script põe no <html>. */
export const EXT_ATTR = 'studyPetsExt';

/** O que a extensão precisa saber. `active: false` limpa as regras. */
export type HardcorePayload =
  | { v: 1; active: false }
  | {
      v: 1;
      active: true;
      /** ms de quando o bloco acaba — as regras somem sozinhas aí. */
      until: number;
      mode: 'blacklist' | 'whitelist';
      sites: string[];
      block: { name: string; endTime: string };
      pet: { name: string; form: string; emoji: string; sprites: string[] } | null;
      appUrl: string;
    };

export function publishHardcore(payload: HardcorePayload): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try {
    // JSON em string: o content script vive num mundo isolado e não lê objetos da página.
    window.dispatchEvent(new CustomEvent(EXT_STATE_EVENT, { detail: JSON.stringify(payload) }));
  } catch {
    // sem extensão ninguém escuta; sem CustomEvent, paciência
  }
}

export function onExtensionQuery(cb: () => void): Unsubscribe {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EXT_QUERY_EVENT, cb);
  return () => window.removeEventListener(EXT_QUERY_EVENT, cb);
}

/** A extensão está instalada nesta página (o content script rodou). */
export function extensionDetected(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.documentElement.dataset[EXT_ATTR];
}
