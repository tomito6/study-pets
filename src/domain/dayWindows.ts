// Janelas de estudo só de um dia ("acordei tarde, hoje começo às 10"), o atalho
// "começar agora" e o "dia livre". Mesmo padrão do almoço editado: é a config
// daquele dia — nunca uma regra especial no gerador. Puro.

import { deriveStartEnd, isValidWindow } from './settings';
import { minsToTime, timeToMins } from './time';
import type { DateKey, StudyWindow, TimeString, UserConfig } from './types';

/** As janelas de um dia. Lista vazia = dia livre (o plano fica sem blocos). */
export interface DayWindowsOverride {
  studyWindows: StudyWindow[];
}

export type WindowOverrides = Record<DateKey, DayWindowsOverride>;

export const isDayOff = (ov: DayWindowsOverride | null | undefined): boolean => !!ov && ov.studyWindows.length === 0;

/** A config efetiva do dia: as janelas do override no lugar das da rotina, com start/end derivados. */
export function configForDay(config: UserConfig, ov: DayWindowsOverride | null | undefined): UserConfig {
  if (!ov) return config;
  return { ...config, studyWindows: ov.studyWindows, ...deriveStartEnd(ov.studyWindows) };
}

export type DayWindowsValidation = { ok: true } | { ok: false; reason: 'empty' | 'invalid-window' | 'overlap' };

/** Mesma regra das janelas da rotina (fim depois do início), mais: sem sobreposição. Vazio só via "dia livre". */
export function validateDayWindows(windows: StudyWindow[]): DayWindowsValidation {
  if (windows.length === 0) return { ok: false, reason: 'empty' };
  if (!windows.every(isValidWindow)) return { ok: false, reason: 'invalid-window' };
  const sorted = [...windows].sort((a, b) => timeToMins(a.start) - timeToMins(b.start));
  for (let i = 1; i < sorted.length; i++) {
    if (timeToMins(sorted[i]!.start) < timeToMins(sorted[i - 1]!.end)) return { ok: false, reason: 'overlap' };
  }
  return { ok: true };
}

export const START_NOW_STEP_MIN = 5;

/** Próximo múltiplo de `step` (o próprio valor, se já for múltiplo). */
export const roundUpToStep = (mins: number, step = START_NOW_STEP_MIN): number => Math.ceil(mins / step) * step;

export type StartNowResult = { ok: true; windows: StudyWindow[]; start: TimeString } | { ok: false; reason: 'nothing-left' };

/**
 * "Começar agora": a janela que contém `now` — ou a próxima, se `now` cai num
 * gap ou antes da primeira — passa a começar no próximo múltiplo de 5 min.
 * Janelas que já terminaram ficam como estão (os blocos delas ainda existem, com
 * seus checks). Se não sobrou janela pela frente, não há o que começar.
 */
export function startNowWindows(windows: StudyWindow[], now: Date): StartNowResult {
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const start = roundUpToStep(nowMins);
  const sorted = windows
    .filter(isValidWindow)
    .map((w) => ({ start: w.start, end: w.end }))
    .sort((a, b) => timeToMins(a.start) - timeToMins(b.start));
  const idx = sorted.findIndex((w) => timeToMins(w.end) > nowMins);
  if (idx < 0) return { ok: false, reason: 'nothing-left' };
  for (let i = idx; i < sorted.length; i++) {
    // Arredondar pra cima pode passar do fim de uma janela que já estava acabando: ela some.
    if (start < timeToMins(sorted[i]!.end)) {
      const startTime = minsToTime(start);
      return { ok: true, windows: [...sorted.slice(0, idx), { start: startTime, end: sorted[i]!.end }, ...sorted.slice(i + 1)], start: startTime };
    }
  }
  return { ok: false, reason: 'nothing-left' };
}
