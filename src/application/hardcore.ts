// Casos de uso do modo hardcore: entrar num bloco, desistir (ou parar de graça
// numa pausa / cancelar em espera), e o que fazer com a sessão que ficou no
// dispositivo ao abrir o app. A conta é do domínio (`domain/hardcore.ts`); aqui
// é efeito: penalidade gravada, XP do pet descontado, check removido, toast.

import { blockFromSession, isForfeited, parseHardcoreSession, penaltyRecord, quitCost, resolveSession } from '../domain/hardcore';
import type { HardcoreSession, QuitCost } from '../domain/hardcore';
import { dk } from '../domain/time';
import { canStartBlock } from '../domain/timer';
import type { StartCheck } from '../domain/timer';
import type { PenaltyRecord, StudyBlock } from '../domain/types';
import { abandonNotice } from '../domain/progressNotices';
import { readHardcoreSession } from '../infrastructure/hardcoreSession';
import { strings } from '../shared/strings';
import { showToast } from '../shared/toast';
import { derived, notify, state } from '../store/store';
import { armHardcoreIfRunning, adoptHardcoreSession, beginHardcoreSession, endHardcoreSession } from './hardcoreRuntime';
import { pushNotifications } from './notifications';
import { activePet, petById } from './pets';
import { blocksForDay, clearBlockCache, computeStatsNow, currentDayKey } from './plan';
import { saveNow } from './save';
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

/** Aplica a penalidade: registro no dia, XP do pet descontado, check do bloco removido. */
function applyPenalty(session: HardcoreSession, cost: QuitCost, reason: PenaltyRecord['reason'], now: Date): void {
  const pet = petById(session.pet) ?? activePet();
  if (pet && cost.petXp > 0) pet.xp = Math.max(0, (pet.xp || 0) - cost.petXp);
  const day = state.penalties[session.dateKey] ?? (state.penalties[session.dateKey] = []);
  day.push(penaltyRecord(session, cost, pet?.id ?? null, reason, now));
  const checks = state.checks[session.dateKey];
  if (checks && checks[session.time]) {
    delete checks[session.time];
    if (Object.keys(checks).length === 0) delete state.checks[session.dateKey];
  }
  clearBlockCache(); // o memo de stats invalida
  void saveNow(); // sem debounce: quem fecha a aba logo depois não escapa da conta
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
  if (r === 'abandon' && !isForfeited(state.penalties, session.dateKey, session.time)) {
    const pet = petById(session.pet);
    // O bloco já acabou: a conta é a de um estudo rodando (nunca "em espera").
    const cost = quitCost({ block: session, now, userTotalXP: computeStatsNow(now).totalXP, petXP: pet ? pet.xp || 0 : null, phase: 'running' });
    if (!cost.free) {
      // A linha ANTES da penalidade, de propósito: `applyPenalty` termina em
      // `saveNow()` — sem debounce, porque quem fecha a aba em seguida não pode
      // escapar da conta. Se a notificação entrasse depois, ela ficaria 800ms na
      // fila enquanto a penalidade já estaria gravada, e quem fechasse a aba nessa
      // janela perderia a linha PRA SEMPRE: no boot seguinte o bloco já está
      // abandonado e a guarda `!isForfeited` pula o ramo inteiro.
      // O toast do boot passa por cima de quem ainda está abrindo o app; a conta
      // cobrada sem ninguém ver é justamente o que o sininho existe pra guardar.
      pushNotifications([abandonNotice(session.dateKey, session, cost, pet?.name ?? null)], now);
      applyPenalty(session, cost, 'abandon', now);
      showToast(strings.hardcore.toast.abandoned(session.name, cost, pet?.name ?? null));
      notify();
    }
    return 'abandoned';
  }
  return 'expired';
}


