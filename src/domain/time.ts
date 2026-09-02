// Helpers de data e horário. Tudo em horário LOCAL do usuário — nunca UTC.
// Essa escolha é deliberada: o app raciocina sobre "o dia do usuário", então
// alguém em Munique e alguém em São Paulo veem cada um o seu próprio dia.

import type { DateKey, TimeString } from './types';

/** Data -> "YYYY-MM-DD" no fuso local. */
export const dk = (d: Date): DateKey =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "HH:MM" -> minutos desde a meia-noite. */
export const timeToMins = (t: TimeString): number => {
  const [h, m] = t.split(':').map(Number);
  return (h as number) * 60 + (m as number);
};

/** Minutos desde a meia-noite -> "HH:MM". */
export const minsToTime = (m: number): TimeString =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Segunda-feira da semana da data dada, à meia-noite. Domingo pertence à semana anterior. */
export function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Data -> "YYYY-MM". */
export const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Converte uma DateKey em Date ao meio-dia local — evita virada de dia por fuso/DST. */
export const dateFromKey = (key: DateKey): Date => new Date(`${key}T12:00:00`);

/** Soma minutos cumpridos e planejados num conjunto de dias, com o percentual. */
export function aggregateMins(
  doneObj: Record<DateKey, number>,
  plannedObj: Record<DateKey, number>,
  keys: DateKey[],
): { done: number; planned: number; pct: number } {
  let done = 0;
  let planned = 0;
  keys.forEach((k) => {
    done += doneObj[k] || 0;
    planned += plannedObj[k] || 0;
  });
  return { done, planned, pct: planned > 0 ? Math.round((done / planned) * 100) : 0 };
}
