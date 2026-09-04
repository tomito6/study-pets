// Casos de uso das janelas de um dia: editar só as de hoje (ou de um dia futuro),
// "começar agora", declarar dia livre e restaurar a rotina. Cada mutação: limpa o
// cache do gerador, refaz as semanas (a data entra nas que expandem o período),
// salva, notifica, conta o que mudou no plano e reagenda o prompt de fim de dia.
//
// Regras: dia encerrado é read-only; dia passado também (mexer nas janelas de
// ontem só mudaria estatística); dia futuro pode — planejar é o ponto. Dia livre
// só antes de qualquer check de hoje: declarar depois de falhar seria o "streak
// freeze", padrão manipulativo que o app evita.

import { isDayClosed } from '../domain/checks';
import { isDayOff, startNowWindows, validateDayWindows } from '../domain/dayWindows';
import type { DayWindowsOverride } from '../domain/dayWindows';
import { dk } from '../domain/time';
import type { DateKey, StudyBlock, StudyWindow, TimeString } from '../domain/types';
import { notify, state } from '../store/store';
import { rescheduleEndOfDayPrompt } from './dayEnd';
import { notifyPlanDelta } from './events';
import { blocksForDay, clearBlockCache, rebuildWeeks } from './plan';
import { scheduleSave } from './save';

export type DayWindowsRefusal =
  | 'closed'
  | 'past'
  | 'not-today'
  | 'has-checks'
  | 'empty'
  | 'invalid-window'
  | 'overlap'
  | 'nothing-left';

export type DayWindowsResult = { ok: true } | { ok: false; reason: DayWindowsRefusal };
export type StartNowOutcome = { ok: true; start: TimeString } | { ok: false; reason: DayWindowsRefusal };

export const dayWindowsOverride = (dateKey: DateKey): DayWindowsOverride | null => state.windowOverrides[dateKey] ?? null;

/** As janelas que valem pro dia: as editadas, ou as da rotina. */
export const effectiveWindows = (dateKey: DateKey): StudyWindow[] =>
  dayWindowsOverride(dateKey)?.studyWindows ?? state.config.studyWindows;

export const isDayOffKey = (dateKey: DateKey): boolean => isDayOff(dayWindowsOverride(dateKey));

export function canEditDayWindows(dateKey: DateKey, now: Date = new Date()): DayWindowsResult {
  if (isDayClosed(state.closedDays, dateKey)) return { ok: false, reason: 'closed' };
  if (dateKey < dk(now)) return { ok: false, reason: 'past' };
  return { ok: true };
}

function commit(dateKey: DateKey, before: StudyBlock[], now: Date): void {
  clearBlockCache();
  rebuildWeeks(now);
  scheduleSave();
  notify();
  notifyPlanDelta(dateKey, before);
  if (dateKey === dk(now)) rescheduleEndOfDayPrompt(now); // o último estudo de hoje pode ter mudado
}

export function setDayWindows(dateKey: DateKey, windows: StudyWindow[], now: Date = new Date()): DayWindowsResult {
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return can;
  const v = validateDayWindows(windows);
  if (!v.ok) return v;
  const before = blocksForDay(dateKey);
  state.windowOverrides[dateKey] = { studyWindows: windows.map((w) => ({ start: w.start, end: w.end })) };
  commit(dateKey, before, now);
  return { ok: true };
}

/** "Começar agora" — só hoje. Devolve o novo início, pro toast. */
export function startNow(dateKey: DateKey, now: Date = new Date()): StartNowOutcome {
  if (dateKey !== dk(now)) return { ok: false, reason: 'not-today' };
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return can;
  const r = startNowWindows(effectiveWindows(dateKey), now);
  if (!r.ok) return r;
  const set = setDayWindows(dateKey, r.windows, now);
  return set.ok ? { ok: true, start: r.start } : set;
}

/** Dia livre: sem blocos, e neutro na sequência (como fim de semana com `skipWeekends`). */
export function setDayOff(dateKey: DateKey, now: Date = new Date()): DayWindowsResult {
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return can;
  if (Object.keys(state.checks[dateKey] ?? {}).length > 0) return { ok: false, reason: 'has-checks' };
  const before = blocksForDay(dateKey);
  state.windowOverrides[dateKey] = { studyWindows: [] };
  commit(dateKey, before, now);
  return { ok: true };
}

/** "Restaurar rotina": o dia volta a seguir a config. */
export function clearDayWindows(dateKey: DateKey, now: Date = new Date()): DayWindowsResult {
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return can;
  if (!state.windowOverrides[dateKey]) return { ok: true };
  const before = blocksForDay(dateKey);
  delete state.windowOverrides[dateKey];
  commit(dateKey, before, now);
  return { ok: true };
}
