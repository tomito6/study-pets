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

// ---------------------------------------------------------------- o alarme do fim do bloco

/** App → extensão: o que o timer está fazendo — "avise às 10:25 com isto" ou "nada rodando". */
export const EXT_TIMER_EVENT = 'study-pets:timer';
/** Extensão → app: "armei o alarme pras 10:25" (ou não). */
export const EXT_TIMER_ACK_EVENT = 'study-pets:timer-ack';
/** A versão do payload do timer. A extensão ignora o que não for esta. */
export const TIMER_VERSION = 1;

export type TimerSoundName = 'estudo' | 'pausa_curta' | 'pausa_longa' | 'sucesso';

/**
 * O que a extensão precisa pra avisar o fim do bloco no lugar do app: QUANDO, o texto
 * pronto (título e corpo — quem escreve é o app, a extensão continua burra), QUAL som e
 * em que volume (a preferência deste dispositivo, que ela não tem como ler), e a URL do
 * app, pra conferir se ele está em frente e pra abrir no clique da notificação.
 *
 * `running: false` desarma: o app parou, pausou ou nunca teve nada. Recarregar a página
 * NÃO manda isto — uma carga que nunca armou nada não desarma o que a anterior armou —,
 * então a aba descartada pelo navegador no meio do estudo ainda é avisada na hora.
 */
export type TimerPayload =
  | { v: 1; running: false }
  | {
      v: 1;
      running: true;
      /** ms de quando o bloco termina — o alarme da extensão dispara aí. */
      endsAt: number;
      title: string;
      body: string;
      sound: TimerSoundName;
      audio: { volume: number; muted: boolean };
      appUrl: string;
    };

/** O que a extensão diz ter armado. */
export interface TimerAck {
  armed: boolean;
  /** ms do alarme armado; 0 quando nada está armado. */
  endsAt: number;
}

export function publishTimer(payload: TimerPayload): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(EXT_TIMER_EVENT, { detail: JSON.stringify(payload) }));
  } catch {
    // sem extensão ninguém escuta
  }
}

/** O ack cru (JSON no `detail`) validado. `null` se não é nosso. */
export function parseTimerAck(raw: unknown): TimerAck | null {
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
    armed: r.armed === true,
    endsAt: typeof r.endsAt === 'number' && Number.isFinite(r.endsAt) ? r.endsAt : 0,
  };
}

export function onTimerAck(cb: (ack: TimerAck) => void): Unsubscribe {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const ack = parseTimerAck((e as CustomEvent).detail);
    if (ack) cb(ack);
  };
  window.addEventListener(EXT_TIMER_ACK_EVENT, handler);
  return () => window.removeEventListener(EXT_TIMER_ACK_EVENT, handler);
}
