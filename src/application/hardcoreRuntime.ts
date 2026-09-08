// A sessão hardcore em andamento: o que fica em `derived.hardcore` e no
// dispositivo (localStorage). Sem os verbos de entrar/desistir — esses ficam em
// `hardcore.ts`, que precisa do timer; o timer precisa daqui (emendar, terminar).
// Duas pontas, sem ciclo.
//
// Uma sessão só "vale" quando o bloco começa a rodar (`armed`): antes disso
// (em espera) não há nada a cobrar, e fechar a aba não é abandono.
//
// **Bloquear sites não é assunto daqui** desde 2026-09-08: quem fala com a
// extensão é `application/siteBlock.ts`, uma fonte só, com ou sem hardcore.

import { sessionFor } from '../domain/hardcore';
import type { HardcoreSession } from '../domain/hardcore';
import { dk } from '../domain/time';
import { timerProgress } from '../domain/timer';
import type { StudyBlock } from '../domain/types';
import { clearHardcoreSession, writeHardcoreSession } from '../infrastructure/hardcoreSession';
import { armUnloadGuard, disarmUnloadGuard } from '../infrastructure/unloadGuard';
import { derived, state } from '../store/store';
import { activePet } from './pets';

const uid = (): string | null => state.user?.uid ?? null;

/** Sessão nova pro bloco (ainda em espera até `armHardcoreIfRunning` ver o relógio). */
export function beginHardcoreSession(block: StudyBlock, now: Date): void {
  derived.hardcore = { ...sessionFor(block, dk(now), activePet()?.id ?? null, now), armed: false };
}

/** Uma sessão que veio do dispositivo (recarregou a página no meio do bloco). */
export function adoptHardcoreSession(session: HardcoreSession): void {
  derived.hardcore = { ...session, armed: false };
}

/**
 * O bloco começou a rodar? Então a sessão passa a valer: gravada no dispositivo
 * e — se é estudo — o guard de fechar a aba. Pausa sai de graça. Idempotente; o
 * tick do timer chama a cada segundo.
 */
export function armHardcoreIfRunning(now: Date = new Date()): void {
  const hc = derived.hardcore;
  if (!hc || hc.armed) return;
  if (timerProgress(hc, now).phase !== 'running') return;
  hc.armed = true;
  const u = uid();
  if (u) writeHardcoreSession(u, hc);
  if (hc.type === 'estudo') armUnloadGuard();
  else disarmUnloadGuard();
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
}
