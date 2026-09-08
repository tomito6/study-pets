// A ponte com a extensão do navegador (pasta `extension/`): uma página web não
// bloqueia site nenhum, então o app só AVISA — um evento no `window`, com o
// estado do bloqueio em JSON — e o content script da extensão repassa pro
// service worker, que aplica as regras. A extensão se anuncia com um atributo no
// <html> (o valor é a versão dela) e responde com um **ack** dizendo o que de
// fato aplicou; é assim que Configurações consegue dizer "bloqueando 3 sites até
// 02:55" em vez de só "instalada".
// Sem `window` (Node), tudo é no-op.

import type { SiteBlockMode } from '../domain/types';
import type { Unsubscribe } from './ports';

/** App → extensão: o estado atual (a cada mudança, e em resposta à pergunta). */
export const EXT_STATE_EVENT = 'study-pets:blocking';
/** Extensão → app: "qual é o estado agora?" (ao carregar o content script). */
export const EXT_QUERY_EVENT = 'study-pets:blocking?';
/** Extensão → app: "apliquei isto" (resposta do service worker, repassada pelo content script). */
export const EXT_ACK_EVENT = 'study-pets:blocking-ack';
/** O atributo que o content script põe no <html>; o valor é a versão da extensão. */
export const EXT_ATTR = 'studyPetsExt';

/** A versão do payload. A extensão ignora o que não for esta. */
export const BLOCKING_VERSION = 2;

export interface BlockingBlock {
  name: string;
  endTime: string;
}

export interface BlockingPet {
  name: string;
  form: string;
  emoji: string;
  sprites: string[];
}

/**
 * O que a extensão precisa saber.
 *
 * `active: false` vem com um motivo, e a diferença importa: **`stopped`** é o app
 * dizendo "acabou, pode liberar" (fim do bloco, ✕ Parar, desistir, fim do dia,
 * logout) e limpa as regras; **`unknown`** é "não sei" — o app acabou de carregar
 * e não tem estudo rodando, o que NÃO prova que o bloco acabou (o timer não
 * sobrevive a reload). Com `unknown` a extensão mantém o que tinha até o alarme
 * do `until` vencer; senão recarregar a página seria a porta de escape.
 */
export type BlockingPayload =
  | { v: 2; active: false; reason: 'stopped' | 'unknown' }
  | {
      v: 2;
      active: true;
      /** ms de quando o bloqueio acaba — as regras somem sozinhas aí. */
      until: number;
      mode: SiteBlockMode;
      /** Já expandida com os apelidos (ver domain/siteBlock.ts): a extensão é burra. */
      sites: string[];
      /** O bloco de estudo em andamento; null no teste de 1 min. */
      block: BlockingBlock | null;
      pet: BlockingPet | null;
      appUrl: string;
      /** O estudo está no modo hardcore (muda a frase de saída na tela do pet). */
      hardcore: boolean;
      /** É o "▶ Testar por 1 min" das Configurações. */
      test: boolean;
    };

/** O que a extensão diz ter aplicado. */
export interface BlockingAck {
  applied: boolean;
  /** ms; 0 quando nada está aplicado. */
  until: number;
  /** Quantos domínios entraram nas regras. */
  sites: number;
  mode: SiteBlockMode | null;
  test: boolean;
}

export function publishBlocking(payload: BlockingPayload): void {
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

const isMode = (v: unknown): v is SiteBlockMode => v === 'blacklist' || v === 'whitelist';

/** O ack cru (JSON no `detail`) validado. `null` se não é nosso. */
export function parseBlockingAck(raw: unknown): BlockingAck | null {
  if (typeof raw !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const r = parsed as Record<string, unknown>;
  return {
    applied: r.applied === true,
    until: typeof r.until === 'number' && Number.isFinite(r.until) ? r.until : 0,
    sites: typeof r.sites === 'number' && Number.isFinite(r.sites) ? r.sites : 0,
    mode: isMode(r.mode) ? r.mode : null,
    test: r.test === true,
  };
}

export function onBlockingAck(cb: (ack: BlockingAck) => void): Unsubscribe {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const ack = parseBlockingAck((e as CustomEvent).detail);
    if (ack) cb(ack);
  };
  window.addEventListener(EXT_ACK_EVENT, handler);
  return () => window.removeEventListener(EXT_ACK_EVENT, handler);
}

/** A extensão está instalada nesta página (o content script rodou). */
export function extensionDetected(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.documentElement.dataset[EXT_ATTR];
}

/** A versão que a extensão anunciou ("0.2.0"). `null` na v1, que só escrevia "1". */
export function extensionVersion(): string | null {
  if (typeof document === 'undefined') return null;
  const v = document.documentElement.dataset[EXT_ATTR];
  return v && v.includes('.') ? v : null;
}
