// Casos de uso do modo hardcore: entrar num bloco, desistir (ou parar de graça
// numa pausa / cancelar em espera), e o que fazer com a sessão que ficou no
// dispositivo ao abrir o app. A conta é do domínio (`domain/hardcore.ts`); aqui
// é efeito: penalidade gravada, XP do pet descontado, check removido, toast.

import { blockFromSession, isForfeited, parseHardcoreSession, quitCost, resolveSession } from '../domain/hardcore';
import type { QuitCost } from '../domain/hardcore';
import { dk } from '../domain/time';
import { canStartBlock } from '../domain/timer';
import type { StartCheck } from '../domain/timer';
import type { StudyBlock } from '../domain/types';
import { readHardcoreSession } from '../infrastructure/hardcoreSession';
import { strings } from '../shared/strings';
import { showToast } from '../shared/toast';
import { derived, notify, state } from '../store/store';
import { abandonHardcore, applyPenalty, armHardcoreIfRunning, adoptHardcoreSession, beginHardcoreSession, endHardcoreSession } from './hardcoreRuntime';
import { activePet, petById } from './pets';
import { blocksForDay, computeStatsNow, currentDayKey } from './plan';
import { syncBlocking } from './siteBlock';
import { startContextFor, startTimer, stopTimer } from './timer';

export const hardcoreEnabled = (): boolean => state.config.hardcore?.enabled === true;

/**
 * Entrar em modo hardcore num bloco de hoje. Mesmas recusas do timer, mais o
 * bloco abandonado. O foco abre como sempre; a sessão só passa a valer quando o
 * bloco começa a rodar (em espera, cancelar é de graça).
 */
export function startHardcore(block: StudyBlock, now: Date = new Date()): StartCheck {
  const todayKey = dk(now);
  const check = canStartBlock(block, currentDayKey(), now, startContextFor(block, todayKey));
  if (!check.ok) return check;
  beginHardcoreSession(block, now);
  startTimer(block, now);
  armHardcoreIfRunning(now);
  syncBlocking(now); // a sessão armou depois do startTimer: o payload precisa saber que é hardcore
  return check;
}

/** A conta de desistir agora — o modal mostra antes de confirmar. `null` sem sessão. */
export function hardcoreQuitPreview(now: Date = new Date()): QuitCost | null {
  const hc = derived.hardcore;
  if (!hc) return null;
  const pet = petById(hc.pet) ?? activePet();
  return quitCost({ block: hc, now, userTotalXP: computeStatsNow(now).totalXP, petXP: pet ? pet.xp || 0 : null });
}

/**
 * "Desistir" (estudo rodando: custa), "Parar aqui" (pausa: livre) ou "Cancelar"
 * (em espera: livre). Devolve a conta que foi aplicada; `null` sem sessão.
 */
export function quitHardcore(now: Date = new Date()): QuitCost | null {
  const hc = derived.hardcore;
  if (!hc) return null;
  const cost = hardcoreQuitPreview(now)!;
  const pet = petById(hc.pet) ?? activePet();
  if (!cost.free) applyPenalty(hc, cost, 'quit', now);
  endHardcoreSession();
  stopTimer();
  if (!cost.free) showToast(strings.hardcore.toast.quit(hc.name, cost, pet?.name ?? null));
  notify();
  return cost;
}

export type BootResolution = 'none' | 'resumed' | 'abandoned' | 'expired';

/**
 * Ao abrir o app: a sessão que ficou neste dispositivo. O bloco ainda roda →
 * o foco volta (recarregar não é sair). Acabou sem o app → abandono: a mesma
 * conta de desistir, cobrada agora. Pausa que acabou é só esquecer.
 */
export function resumeHardcoreOnBoot(now: Date = new Date()): BootResolution {
  const uid = state.user?.uid;
  if (!uid) return 'none';
  const session = parseHardcoreSession(readHardcoreSession(uid));
  if (!session) return 'none';
  const r = resolveSession(session, now);
  if (r === 'resume') {
    const block = blocksForDay(session.dateKey).find((b) => b.time === session.time && b.endTime === session.endTime) ?? blockFromSession(session);
    adoptHardcoreSession({ ...session, name: block.name, xp: block.xp || 0 });
    startTimer(block, now);
    armHardcoreIfRunning(now);
    syncBlocking(now);
    return 'resumed';
  }
  endHardcoreSession();
  // O `isForfeited` aqui decide só o RÓTULO — um bloco já cobrado é uma sessão
  // vencida, não um abandono novo. Quem decide se cobra é o `abandonHardcore`, que
  // checa o mesmo por dentro. O toast do boot passa por cima de quem ainda está
  // abrindo o app; a conta cobrada sem ninguém ver é o que o sininho existe pra guardar.
  if (r === 'abandon' && !isForfeited(state.penalties, session.dateKey, session.time)) {
    abandonHardcore(session, now, 'fechou');
    return 'abandoned';
  }
  return 'expired';
}


