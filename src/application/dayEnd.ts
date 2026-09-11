// Encerrar o dia (manual e pelo prompt automático) e o resumo que vem depois.
//
// Modais deste fluxo vivem em `derived.dayEnd` porque quem os abre é um caso de
// uso (o agendador do fim de dia, o próprio encerramento), não só um clique local.

import { isDayClosed } from '../domain/checks';
import { daySummary } from '../domain/daySummary';
import type { DaySummary, ProgressSnapshot } from '../domain/daySummary';
import { extendDayTo, extendWindowsTo, lastStudyEnd, msUntil, shouldPromptEndOfDay } from '../domain/endOfDay';
import { pausesTotal } from '../domain/pauses';
import { getLevelIdx } from '../domain/progression';
import { dk } from '../domain/time';
import type { TimeString } from '../domain/types';
import { showToast } from '../shared/toast';
import { strings } from '../shared/strings';
import { derived, notify, state } from '../store/store';
import { applyPendingPetXP } from './pets';
import { blocksForDay, clearBlockCache, computeStatsNow } from './plan';
import { scheduleSave } from './save';
import { stopBlocking } from './siteBlock';
import { stopTimer } from './timer';

export interface DayEndState {
  confirmOpen: boolean;
  promptOpen: boolean;
  /** Horário do último estudo, mostrado no prompt. */
  promptLastEnd: TimeString;
  summary: DaySummary | null;
}

export const initialDayEnd = (): DayEndState => ({ confirmOpen: false, promptOpen: false, promptLastEnd: '', summary: null });

function set(patch: Partial<DayEndState>): void {
  derived.dayEnd = { ...derived.dayEnd, ...patch };
  notify();
}

// ---------------------------------------------------------------- encerrar

export const openFinishDay = (): void => set({ confirmOpen: true });
export const closeFinishDay = (): void => set({ confirmOpen: false });
export const closeSummary = (): void => set({ summary: null });

function snapshot(now: Date): ProgressSnapshot {
  const stats = computeStatsNow(now);
  return {
    totalXP: stats.totalXP,
    coins: stats.coins,
    userLevelIdx: getLevelIdx(stats.totalXP),
    petXP: Object.fromEntries(state.pets.owned.map((p) => [p.id, p.xp || 0])),
  };
}

/**
 * Decisão final: trava os checks de hoje, credita o XP dos pets na hora, e
 * devolve o resumo (que também vai pro store, pra UI mostrar).
 */
export function closeDay(now: Date = new Date()): DaySummary {
  const todayKey = dk(now);
  const before = snapshot(now);
  if (derived.timerPausedAt != null) stopTimer(); // encerrar o dia com o timer pausado: a pausa acaba aqui, sem registro
  if (!state.closedDays) state.closedDays = {};
  state.closedDays[todayKey] = true;
  // O memo do `computeStatsNow` é por versão do store: sem isto, a passada que o
  // `applyPendingPetXP` faz logo abaixo (pro sininho) leria o dia ainda aberto.
  notify();
  // Credita os pets e, junto, registra no sininho os dias que acabaram de entrar
  // na conta — o mesmo caminho de quando o dia fecha sozinho na virada do dia.
  applyPendingPetXP(now);
  scheduleSave(); // notifica → o memo de stats invalida
  clearPromptTimer();
  stopBlocking(); // o dia acabou: nada mais bloqueia
  const summary = daySummary(before, snapshot(now), state.pets.owned, pausesTotal(state.pauses?.[todayKey]));
  set({ confirmOpen: false, promptOpen: false, summary });
  return summary;
}

// ---------------------------------------------------------------- prompt automático

let promptTimeout: ReturnType<typeof setTimeout> | null = null;
/** Evita reabrir o prompt depois que já apareceu (até prolongar ou salvar config). */
let promptShown = false;

function clearPromptTimer(): void {
  if (promptTimeout) clearTimeout(promptTimeout);
  promptTimeout = null;
}

function todayLastStudyEnd(now: Date): TimeString | null {
  return lastStudyEnd(blocksForDay(dk(now)));
}

function checkEndOfDayPrompt(now: Date): void {
  if (promptShown) return;
  // Com o timer pausado o último estudo ainda vai mudar — quem retoma reagenda; um "encerrar?" em cima de um pomo pausado é a coisa errada na hora errada.
  if (derived.timerPausedAt != null) return;
  const todayKey = dk(now);
  const ok = shouldPromptEndOfDay({
    dayClosed: isDayClosed(state.closedDays, todayKey),
    hasCheckToday: Object.keys(state.checks[todayKey] ?? {}).length > 0,
    lastEnd: todayLastStudyEnd(now),
    now,
  });
  if (!ok) return;
  promptShown = true;
  openEndOfDayPrompt(now);
}

/** Agenda o prompt pro momento exato em que o último estudo de hoje termina. Sem polling. */
export function scheduleEndOfDayPrompt(now: Date = new Date()): void {
  clearPromptTimer();
  if (promptShown) return;
  if (isDayClosed(state.closedDays, dk(now))) return;
  const lastEnd = todayLastStudyEnd(now);
  if (!lastEnd) return;
  const delay = msUntil(lastEnd, now);
  if (delay <= 0) {
    checkEndOfDayPrompt(now);
    return;
  }
  promptTimeout = setTimeout(() => {
    promptTimeout = null;
    checkEndOfDayPrompt(new Date());
  }, delay);
}

/** Config mudou (ou o dia foi prolongado): o prompt pode aparecer de novo no novo horário. */
export function rescheduleEndOfDayPrompt(now: Date = new Date()): void {
  promptShown = false;
  scheduleEndOfDayPrompt(now);
}

export function openEndOfDayPrompt(now: Date = new Date()): void {
  set({ promptOpen: true, promptLastEnd: todayLastStudyEnd(now) || state.config.end || '18:00' });
}

export const closeEndOfDayPrompt = (): void => set({ promptOpen: false });

/** "Encerrar o dia" no prompt: fecha o prompt e abre a confirmação normal. */
export const promptFinish = (): void => set({ promptOpen: false, confirmOpen: true });

/**
 * "Prolongar": novo fim do dia; a última janela de estudo estica até lá. Num dia
 * com as janelas editadas, é o override de hoje que estica — a rotina fica igual.
 */
export function extendDay(newEnd: TimeString, now: Date = new Date()): void {
  if (!newEnd) return;
  const todayKey = dk(now);
  const ov = state.windowOverrides[todayKey];
  if (ov && ov.studyWindows.length > 0) state.windowOverrides[todayKey] = { studyWindows: extendWindowsTo(ov.studyWindows, newEnd) };
  else state.config = extendDayTo(state.config, newEnd);
  clearBlockCache();
  scheduleSave();
  set({ promptOpen: false });
  rescheduleEndOfDayPrompt(now);
  showToast(strings.dayEnd.extended(newEnd));
}

/** Só pra testes: esquece que o prompt já apareceu. */
export function resetEndOfDayPrompt(): void {
  clearPromptTimer();
  promptShown = false;
}
