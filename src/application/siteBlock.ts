// O bloqueio de sites: quando ele vale, e o que a extensão do navegador recebe.
//
// **A regra, em uma frase:** enquanto um ESTUDO está rodando no timer do app —
// foco aberto ou só a barra, com ou sem hardcore — os sites da lista mostram o
// pet em vez da página. Pausa não bloqueia (é a saída natural), bloco em espera
// também não (nada começou ainda).
//
// O app é a única fonte: quem publica pra extensão é só este arquivo. O hardcore
// cuida de sessão e penalidade e não fala mais com a extensão.
//
// **Parar x não saber.** O timer do app não sobrevive a um reload (`derived` é
// runtime). Se ao carregar a página a gente dissesse "inativo", recarregar viraria
// a porta de escape: some com o bloqueio no meio do estudo. Então:
// - o app só diz `stopped` quando ELE encerrou (fim do bloco, ✕ Parar, desistir,
//   fim do dia, logout) — e nesta carga da página ele precisa ter armado algo antes;
// - à pergunta da extensão sem nada rodando, responde `unknown`, e a extensão
//   mantém o que tinha até o alarme do `until` vencer. Um pomodoro de 25 min nunca
//   deixa regra pendurada por mais que isso.

import { expandSites, normalizeSiteBlockConfig, siteBlockArmable } from '../domain/siteBlock';
import { petForm } from '../domain/pets';
import { cleanBlockName, timerProgress, todayAt } from '../domain/timer';
import type { SiteBlockMode, StudyBlock } from '../domain/types';
import {
  extensionDetected,
  onBlockingAck,
  onExtensionQuery,
  publishBlocking,
} from '../infrastructure/extensionBridge';
import type { BlockingPayload, BlockingPet } from '../infrastructure/extensionBridge';
import type { Unsubscribe } from '../infrastructure/ports';
import { derived, notify, state } from '../store/store';
import { activePet, petById } from './pets';

/** Quanto dura o "▶ Testar por 1 min" das Configurações. */
export const TEST_MS = 60_000;

const STOPPED: BlockingPayload = { v: 2, active: false, reason: 'stopped' };
const UNKNOWN: BlockingPayload = { v: 2, active: false, reason: 'unknown' };

/** A assinatura do último payload publicado NESTA carga da página. `null` = nunca publicamos nada. */
let published: string | null = null;

const appUrl = (): string => (typeof location !== 'undefined' ? location.origin : '');

/** O estudo que faz o bloqueio valer agora: de hoje, rodando (nem em espera, nem pausa). */
function runningStudy(now: Date): StudyBlock | null {
  const b = derived.timerBlock;
  if (!b || b.type !== 'estudo') return null;
  return timerProgress(b, now).phase === 'running' ? b : null;
}

function petPayload(): BlockingPet | null {
  const pet = petById(derived.hardcore?.pet ?? null) ?? activePet();
  const form = pet ? petForm(pet) : null;
  if (!pet || !form) return null;
  const base = appUrl();
  return {
    name: pet.name,
    form: form.name,
    emoji: form.emoji,
    sprites: Array.from({ length: form.frames }, (_, i) => `${base}/${form.sprite(i)}`),
  };
}

/** O que a extensão deveria estar aplicando neste instante. */
function desiredPayload(now: Date): BlockingPayload {
  const test = derived.siteBlock.test;
  if (test && test.until > now.getTime()) {
    return {
      v: 2,
      active: true,
      until: test.until,
      mode: test.mode,
      sites: expandSites(test.sites),
      block: null,
      pet: petPayload(),
      appUrl: appUrl(),
      hardcore: false,
      test: true,
    };
  }
  const block = runningStudy(now);
  const cfg = normalizeSiteBlockConfig(state.config.siteBlock);
  if (!block || !siteBlockArmable(cfg)) return STOPPED;
  return {
    v: 2,
    active: true,
    until: todayAt(block.endTime, now).getTime(),
    mode: cfg.mode,
    sites: expandSites(cfg.sites),
    block: { name: cleanBlockName(block.name), endTime: block.endTime },
    pet: petPayload(),
    appUrl: appUrl(),
    hardcore: derived.hardcore?.armed === true,
    test: false,
  };
}

function send(payload: BlockingPayload): void {
  published = JSON.stringify(payload);
  publishBlocking(payload);
}

/**
 * Acerta a extensão com o estado de agora. Idempotente: só publica quando muda.
 * O timer chama a cada segundo (e ao voltar pra aba visível).
 */
export function syncBlocking(now: Date = new Date()): void {
  // Estudo de verdade vence o teste de 1 min — o teste é só uma prévia.
  if (derived.siteBlock.test && runningStudy(now)) clearTest();
  const payload = desiredPayload(now);
  // Esta carga da página nunca armou nada: ela não tem autoridade pra mandar parar
  // (pode ser um reload no meio de um estudo — ver o cabeçalho).
  if (!payload.active && published === null) return;
  const sig = JSON.stringify(payload);
  if (sig === published) return;
  send(payload);
  if (!payload.active) setAck(null);
}

/** O app encerrou: pode liberar. É o único caminho que manda `stopped` sem rodeio. */
export function stopBlocking(): void {
  clearTest();
  if (published === JSON.stringify(STOPPED)) return;
  send(STOPPED);
  setAck(null);
}

/**
 * A extensão perguntou (recarregou, foi instalada agora, o navegador reabriu).
 * Sem estudo rodando a resposta é `unknown`, não `inactive`.
 */
export function answerExtensionQuery(now: Date = new Date()): void {
  const payload = desiredPayload(now);
  if (payload.active) send(payload);
  else publishBlocking(UNKNOWN);
}

// ---------------------------------------------------------------- teste de 1 min

let testTimer: ReturnType<typeof setTimeout> | null = null;

function clearTest(): void {
  if (testTimer) clearTimeout(testTimer);
  testTimer = null;
  derived.siteBlock.test = null;
}

export type TestRefusal = 'no-extension' | 'no-sites';

/**
 * "▶ Testar por 1 min": publica a lista **do rascunho** (dá pra testar antes de
 * Salvar) por 60 s. É a resposta ao "não funciona" — o usuário vê na hora.
 */
export function startSiteBlockTest(mode: SiteBlockMode, sites: string[], now: Date = new Date()): { ok: true } | { ok: false; reason: TestRefusal } {
  if (!extensionDetected()) return { ok: false, reason: 'no-extension' };
  if (mode === 'blacklist' && sites.length === 0) return { ok: false, reason: 'no-sites' };
  clearTest();
  derived.siteBlock.test = { until: now.getTime() + TEST_MS, mode, sites };
  testTimer = setTimeout(() => stopSiteBlockTest(), TEST_MS);
  syncBlocking(now);
  notify();
  return { ok: true };
}

/** "■ Parar teste" — e também o que roda sozinho quando o minuto acaba. */
export function stopSiteBlockTest(now: Date = new Date()): void {
  if (!derived.siteBlock.test) return;
  clearTest();
  syncBlocking(now);
  notify();
}

// ---------------------------------------------------------------- ack da extensão

function setAck(ack: typeof derived.siteBlock.ack): void {
  if (derived.siteBlock.ack === ack) return;
  derived.siteBlock.ack = ack;
  notify();
}

/** O bloqueio está valendo AGORA segundo a própria extensão. `null` sem confirmação. */
export function blockingNow(now: Date = new Date()): { sites: number; until: number; test: boolean } | null {
  const ack = derived.siteBlock.ack;
  if (!ack || !ack.applied || ack.until <= now.getTime()) return null;
  return { sites: ack.sites, until: ack.until, test: ack.test };
}

let watches: Unsubscribe[] = [];

/** Registra uma vez: a extensão pergunta o estado ao carregar, e confirma o que aplicou. */
export function watchExtension(): void {
  if (watches.length > 0) return;
  watches = [
    onExtensionQuery(() => answerExtensionQuery()),
    onBlockingAck((ack) => setAck(ack)),
  ];
}

/** Só pros testes: esquece o que foi publicado nesta "carga da página". */
export function resetBlockingForTests(): void {
  published = null;
  clearTest();
  derived.siteBlock.ack = null;
  for (const off of watches) off();
  watches = [];
}
