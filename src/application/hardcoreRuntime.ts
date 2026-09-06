// A sessão hardcore em andamento: o que fica em `derived.hardcore`, no
// dispositivo (localStorage) e o que a extensão do navegador precisa saber.
// Sem os verbos de entrar/desistir — esses ficam em `hardcore.ts`, que precisa
// do timer; o timer precisa daqui (emendar, terminar). Duas pontas, sem ciclo.
//
// Uma sessão só "vale" quando o bloco começa a rodar (`armed`): antes disso
// (em espera) não há nada a cobrar, e fechar a aba não é abandono.

import { petForm } from '../domain/pets';
import { sessionFor } from '../domain/hardcore';
import type { HardcoreRuntime, HardcoreSession } from '../domain/hardcore';
import { dk } from '../domain/time';
import { cleanBlockName, timerProgress, todayAt } from '../domain/timer';
import type { StudyBlock } from '../domain/types';
import { publishHardcore } from '../infrastructure/extensionBridge';
import { clearHardcoreSession, writeHardcoreSession } from '../infrastructure/hardcoreSession';
import { armUnloadGuard, disarmUnloadGuard } from '../infrastructure/unloadGuard';
import { derived, state } from '../store/store';
import { activePet, petById } from './pets';

const uid = (): string | null => state.user?.uid ?? null;

const appUrl = (): string => (typeof location !== 'undefined' ? location.origin : '');

/** O que a extensão recebe: quando bloquear, o quê, e quem está esperando. */
function payloadFor(hc: HardcoreRuntime, now: Date) {
  const pet = petById(hc.pet);
  const form = pet ? petForm(pet) : null;
  const base = appUrl();
  return {
    v: 1 as const,
    active: true as const,
    until: todayAt(hc.endTime, now).getTime(),
    mode: state.config.hardcore?.mode ?? 'blacklist',
    sites: state.config.hardcore?.sites ?? [],
    block: { name: cleanBlockName(hc.name), endTime: hc.endTime },
    pet: pet && form ? { name: pet.name, form: form.name, emoji: form.emoji, sprites: Array.from({ length: form.frames }, (_, i) => `${base}/${form.sprite(i)}`) } : null,
    appUrl: base,
  };
}

/** Sessão nova pro bloco (ainda em espera até `armHardcoreIfRunning` ver o relógio). */
export function beginHardcoreSession(block: StudyBlock, now: Date): void {
  derived.hardcore = { ...sessionFor(block, dk(now), activePet()?.id ?? null, now), armed: false };
}

/** Uma sessão que veio do dispositivo (recarregou a página no meio do bloco). */
export function adoptHardcoreSession(session: HardcoreSession): void {
  derived.hardcore = { ...session, armed: false };
}

/**
 * O bloco começou a rodar? Então a sessão passa a valer: gravada no dispositivo,
 * e — se é estudo — o guard de fechar a aba e o bloqueio de sites. Pausa não
 * bloqueia nada e sai de graça. Idempotente; o tick do timer chama a cada segundo.
 */
export function armHardcoreIfRunning(now: Date = new Date()): void {
  const hc = derived.hardcore;
  if (!hc || hc.armed) return;
  if (timerProgress(hc, now).phase !== 'running') return;
  hc.armed = true;
  const u = uid();
  if (u) writeHardcoreSession(u, hc);
  if (hc.type === 'estudo') {
    armUnloadGuard();
    publishHardcore(payloadFor(hc, now));
  } else {
    disarmUnloadGuard();
    publishHardcore({ v: 1, active: false });
  }
}

/** O foco emendou no bloco seguinte dentro do hardcore. */
export function hardcoreChained(next: StudyBlock, now: Date): void {
  const hc = derived.hardcore;
  if (!hc) return;
  derived.hardcore = { ...sessionFor(next, hc.dateKey, hc.pet, now), armed: false };
  armHardcoreIfRunning(now);
}

/** A sequência acabou (naturalmente, por desistência ou por logout): some tudo. */
export function endHardcoreSession(): void {
  derived.hardcore = null;
  const u = uid();
  if (u) clearHardcoreSession(u);
  disarmUnloadGuard();
  publishHardcore({ v: 1, active: false });
}

/** A extensão perguntou (recarregou, reinstalou): responde com o estado de agora. */
export function republishHardcore(now: Date = new Date()): void {
  const hc = derived.hardcore;
  if (hc && hc.armed && hc.type === 'estudo') publishHardcore(payloadFor(hc, now));
  else publishHardcore({ v: 1, active: false });
}
