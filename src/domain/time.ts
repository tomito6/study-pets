// Helpers de data e horário. Tudo em horário LOCAL do usuário — nunca UTC.
// Essa escolha é deliberada: o app raciocina sobre "o dia do usuário", então
// alguém em Munique e alguém em São Paulo veem cada um o seu próprio dia.

import type { DateKey, StudyBlock, TimeString } from './types';

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

/**
 * A duração de um bloco que vale: do início ao fim, menos o tempo em que o timer
 * ficou pausado dentro dele. É a ÚNICA conta de duração do app — XP, moedas, meta,
 * grupos e o anel do foco passam por aqui, senão uma pausa de 7 min viraria 7
 * moedas e 7 min de meta (um teste varre o código atrás de `endTime - time` solto).
 */
export const blockMins = (b: Pick<StudyBlock, 'time' | 'endTime'> & { paused?: number | undefined }): number =>
  timeToMins(b.endTime) - timeToMins(b.time) - (b.paused ?? 0);

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

/** Sábado ou domingo? */
export const isWeekendKey = (key: DateKey): boolean => {
  const dow = dateFromKey(key).getDay();
  return dow === 0 || dow === 6;
};

