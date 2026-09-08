// Janelas de estudo só de um dia ("acordei tarde, hoje começo às 10"), o atalho
// "começar agora" e o "dia livre". É a config daquele dia — nunca uma regra
// especial no gerador. Puro.
//
// Também decide o que é dia de descanso: fim de semana pausado (`skipWeekends`) ou
// dia declarado livre. Nos dois casos as janelas do dia mandam — abrir uma janela
// num sábado pausado faz daquele sábado um dia de estudo (um "dia bônus").

import { deriveStartEnd, isValidWindow } from './settings';
import { minsToTime, timeToMins } from './time';
import type { DateKey, StudyWindow, TimeString, UserConfig } from './types';

/** As janelas de um dia. Lista vazia = dia livre (o plano fica sem blocos). */
export interface DayWindowsOverride {
  studyWindows: StudyWindow[];
}

export type WindowOverrides = Record<DateKey, DayWindowsOverride>;

export const isDayOff = (ov: DayWindowsOverride | null | undefined): boolean => !!ov && ov.studyWindows.length === 0;

/** Por que um dia não tem blocos: fim de semana pausado ou dia declarado livre. */
export type RestKind = 'weekend' | 'off';

export interface RestDayInput {
  skipWeekends: boolean;
  isWeekend: boolean;
  override: DayWindowsOverride | null | undefined;
}

/**
 * O dia é de descanso? As janelas do dia mandam: com override, o dia só é livre se a
 * lista está vazia — janelas abertas num sábado desfazem a pausa daquele sábado. Sem
 * override, o fim de semana pausado descansa.
 */
export function restDayKind({ skipWeekends, isWeekend, override }: RestDayInput): RestKind | null {
  if (override) return override.studyWindows.length === 0 ? 'off' : null;
  return skipWeekends && isWeekend ? 'weekend' : null;
}

/**
 * Dia bônus: fim de semana pausado em que o usuário abriu janelas mesmo assim. É um dia
 * a mais, não uma obrigação — conta se bateu a meta, e não quebra a sequência se não
 * bateu. Estudar na folga nunca pode ser pior do que não estudar.
 */
export const isBonusDay = ({ skipWeekends, isWeekend, override }: RestDayInput): boolean =>
  skipWeekends && isWeekend && !!override && override.studyWindows.length > 0;

/** As janelas que valem pro dia: as editadas; nenhuma no fim de semana pausado; senão as da rotina. */
export function windowsForDay(
  config: Pick<UserConfig, 'studyWindows' | 'skipWeekends'>,
  override: DayWindowsOverride | null | undefined,
  isWeekend: boolean,
): StudyWindow[] {
  if (override) return override.studyWindows;
  if (config.skipWeekends && isWeekend) return [];
  return config.studyWindows;
}

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
