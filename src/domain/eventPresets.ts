// Atalhos do "Novo evento" (refeição, reunião, café, deslocamento): cada um só
// preenche o formulário — nome com o próprio ícone, horário típico, duração, sem XP,
// e se repete todo dia. O evento que sai dali é um evento como qualquer outro.
//
// Também mora aqui a refeição de todo dia (o que era o "almoço" da config até o
// schema 2) e a migração do almoço antigo pra eventos. Puro.

import { minsToTime, timeToMins } from './time';
import type { DateKey, RecurringEventSeries, StudyEvent, TimeString } from './types';

export type EventPresetId = 'meal' | 'meeting' | 'coffee' | 'commute';

export interface EventPreset {
  id: EventPresetId;
  emoji: string;
  /** Nome sem o ícone ("Refeição"); o evento nasce como "🍽️ Refeição". */
  name: string;
  start: TimeString;
  durationMin: number;
  /** Refeição repete todos os dias por padrão; o resto é pontual. */
  repeatDaily: boolean;
}

/** Um só preset de comida, de propósito: quem janta muda o horário, quem faz as duas adiciona duas. */
export const EVENT_PRESETS: readonly EventPreset[] = [
  { id: 'meal', emoji: '🍽️', name: 'Refeição', start: '13:00', durationMin: 60, repeatDaily: true },
  { id: 'meeting', emoji: '👥', name: 'Reunião', start: '15:00', durationMin: 60, repeatDaily: false },
  { id: 'coffee', emoji: '☕', name: 'Café', start: '16:00', durationMin: 20, repeatDaily: false },
  { id: 'commute', emoji: '🚌', name: 'Deslocamento', start: '08:00', durationMin: 30, repeatDaily: false },
];

/** Dias no formato de `Date.getDay()`: domingo a sábado. */
export const ALL_WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

export const presetLabel = (p: EventPreset): string => `${p.emoji} ${p.name}`;

/** Soma minutos a um horário, sem passar de 23:59. */
export const addMinutes = (t: TimeString, mins: number): TimeString =>
  minsToTime(Math.min(23 * 60 + 59, timeToMins(t) + mins));

export interface PresetFields {
  name: string;
  start: TimeString;
  end: TimeString;
  /** Preset nunca conta como estudo: é o tempo que o plano contorna. */
  countsAsStudy: false;
  repeatDaily: boolean;
}

/** O que o preset preenche no formulário. */
export function presetFields(p: EventPreset): PresetFields {
  return {
    name: presetLabel(p),
    start: p.start,
    end: addMinutes(p.start, p.durationMin),
    countsAsStudy: false,
    repeatDaily: p.repeatDaily,
  };
}

/** Nome que já começa com um emoji traz o próprio ícone — o plano não põe 📅 na frente. */
export const startsWithEmoji = (name: string): boolean => /^\p{Extended_Pictographic}/u.test(name);

// ---------------------------------------------------------------- a refeição de todo dia

export const LUNCH_SERIES_ID = 'ser_almoco';
export const LUNCH_NAME = '🍽️ Almoço';

/**
 * A refeição diária como série de evento sem XP. Sem âncora por padrão: vale pra
 * qualquer dia, inclusive os já passados — é isso que mantém os checks antigos da
 * tarde batendo com os mesmos blocos de antes.
 */
export function mealSeries(
  start: TimeString,
  durationMin: number,
  opts: { id?: string; name?: string; anchor?: DateKey } = {},
): RecurringEventSeries {
  const s: RecurringEventSeries = {
    id: opts.id ?? LUNCH_SERIES_ID,
    name: opts.name ?? LUNCH_NAME,
    start,
    end: addMinutes(start, durationMin),
    weekdays: [...ALL_WEEKDAYS],
    freq: 'weekly',
    until: null,
    exceptions: [],
    countsAsStudy: false,
  };
  if (opts.anchor) s.anchor = opts.anchor;
  return s;
}

/** O almoço como era salvo até o schema 2: na config, com ajustes por dia em `lunchOverrides`. */
export interface LegacyLunch {
  hasLunch: boolean;
  lunch: TimeString;
  lunchDur: number;
  overrides: Record<DateKey, { lunch?: TimeString; lunchDur?: number; hasLunch?: boolean }>;
}

const lunchEvent = (start: TimeString, durationMin: number): StudyEvent => ({
  name: LUNCH_NAME,
  start,
  end: addMinutes(start, durationMin),
  countsAsStudy: false,
});

/**
 * Almoço antigo → eventos: a série diária, e pra cada dia com almoço editado uma
 * exceção na série mais um avulso com o horário daquele dia. Sem almoço na rotina
 * (`hasLunch: false`), só os dias que o ligaram à mão viram avulso.
 */
export function migrateLunch(l: LegacyLunch): { series: RecurringEventSeries | null; events: Record<DateKey, StudyEvent[]> } {
  const events: Record<DateKey, StudyEvent[]> = {};
  const series = l.hasLunch ? mealSeries(l.lunch, l.lunchDur) : null;
  for (const [day, ov] of Object.entries(l.overrides)) {
    if (!ov || typeof ov !== 'object') continue;
    const has = typeof ov.hasLunch === 'boolean' ? ov.hasLunch : l.hasLunch;
    if (series) series.exceptions!.push(day);
    if (has) events[day] = [lunchEvent(ov.lunch ?? l.lunch, ov.lunchDur ?? l.lunchDur)];
  }
  return { series, events };
}
