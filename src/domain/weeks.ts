// As semanas que o app mostra. Construídas a partir de hoje, do período configurado
// e dos dias que já têm dados — sem data hardcoded.

import type { DateKey } from './types';
import { dateFromKey, dk, mondayOf } from './time';

export interface Week {
  /** 1-based, como aparece na UI ("Semana 3"). */
  n: number;
  start: Date;
  end: Date;
}

export interface WeekDay {
  key: DateKey;
  date: Date;
  /** Índice da semana em `weeks` (0-based). */
  weekIdx: number;
  /** 0 = segunda … 6 = domingo. */
  dayIdx: number;
}

export interface BuildWeeksInput {
  periodStart: DateKey | null | undefined;
  periodEnd: DateKey | null | undefined;
  /** Dias que têm checks, eventos, grupos ou janelas do dia — pra nunca esconder dado antigo. */
  dataKeys: DateKey[];
  today: Date;
}

/**
 * Regras (preservadas do original):
 * - começa na segunda-feira de hoje, ou antes se há dados/`periodStart` anteriores
 *   (`periodStart` nunca empurra pra frente — dados antigos continuam visíveis);
 * - com `periodEnd`, o fim é respeitado exatamente (mínimo hoje+7 dias), sem expansão;
 * - sem `periodEnd` ("sempre"), vai até 31/12 do ano (mínimo hoje+8 semanas), e expande
 *   pra frente se houver dados futuros.
 */
export function buildWeeks(input: BuildWeeksInput): Week[] {
  const { today, periodStart, periodEnd } = input;
  let startDate = mondayOf(today);

  const allKeys = [...input.dataKeys].sort();
  if (allKeys.length > 0) {
    const earliestMon = mondayOf(dateFromKey(allKeys[0]!));
    if (earliestMon < startDate) startDate = earliestMon;
  }
  if (periodStart) {
    const ps = mondayOf(dateFromKey(periodStart));
    if (ps < startDate) startDate = ps;
  }

  let endDate: Date;
  if (periodEnd) {
    endDate = mondayOf(dateFromKey(periodEnd));
    endDate.setDate(endDate.getDate() + 6);
    const minEnd = new Date(today);
    minEnd.setDate(minEnd.getDate() + 7);
    if (endDate < minEnd) endDate = minEnd;
  } else {
    const yearEnd = new Date(today.getFullYear(), 11, 31, 12, 0, 0);
    const minEnd = new Date(today);
    minEnd.setDate(minEnd.getDate() + 8 * 7);
    endDate = yearEnd > minEnd ? yearEnd : minEnd;
    if (allKeys.length > 0) {
      const latestMon = mondayOf(dateFromKey(allKeys[allKeys.length - 1]!));
      latestMon.setDate(latestMon.getDate() + 6);
      if (latestMon > endDate) endDate = latestMon;
    }
  }

  const totalWeeks = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (7 * 86400000)) + 1);
  const weeks: Week[] = [];
  for (let i = 0; i < totalWeeks; i++) {
    const s = new Date(startDate);
    s.setDate(s.getDate() + i * 7);
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    weeks.push({ n: i + 1, start: s, end: e });
  }
  return weeks;
}

/** Data de um dia da semana N (1-based). Sem semanas, devolve hoje — melhor que quebrar. */
export function dateForWeekDay(weeks: Week[], weekN: number, dayIdx: number): Date {
  const w = weeks[weekN - 1];
  if (!w) return new Date();
  const d = new Date(w.start);
  d.setDate(d.getDate() + dayIdx);
  return d;
}

/**
 * Semana (1-based) que contém a data.
 *
 * **Por dia, não por instante** (2026-09-12): `w.end` é o domingo às 00:00 (a `mondayOf`
 * zera a hora e o fim é início + 6 dias), então `date <= w.end` era falso em qualquer
 * domingo depois da meia-noite — nenhuma semana casava, e o fallback jogava o usuário na
 * semana 1. Quem tinha histórico antigo abria o app **num domingo de agosto**: o cabeçalho
 * dizia a data de hoje, mas o dia visível era passado, e com ele sumiam "🕘 Janelas do dia"
 * e "✓ Encerrar o dia". Só no domingo, e só pra quem já usava o app — por isso conta nova
 * em teste nunca reproduziu.
 *
 * O fallback também deixou de ser cego: data depois do fim cai na **última** semana, não na
 * primeira. Errar a semana é ruim; errar em 40 dias de distância é outra coisa.
 */
export function findWeek(weeks: Week[], date: Date): number {
  if (weeks.length === 0) return 1;
  const key = dk(date);
  for (const w of weeks) if (dk(w.start) <= key && key <= dk(w.end)) return w.n;
  return key > dk(weeks[weeks.length - 1]!.end) ? weeks[weeks.length - 1]!.n : 1;
}

/** Todos os dias, em ordem. Com `skipWeekends`, sábado e domingo ficam de fora. */
export function weekDays(weeks: Week[], skipWeekends: boolean): WeekDay[] {
  const out: WeekDay[] = [];
  weeks.forEach((w, weekIdx) => {
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      if (skipWeekends && dayIdx >= 5) continue;
      const d = new Date(w.start);
      d.setDate(d.getDate() + dayIdx);
      out.push({ key: dk(d), date: d, weekIdx, dayIdx });
    }
  });
  return out;
}
