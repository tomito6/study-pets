// Os cálculos da aba Análise. Recebem as estatísticas já computadas e devolvem
// dados prontos pra desenhar — nada de DOM, nada de texto de UI.

import type { RestKind } from './dayWindows';
import { LEVELS } from './progression';
import type { Stats } from './stats';
import { dk, mondayOf } from './time';
import type { DateKey, TimeString } from './types';

/** Segunda a domingo da semana de `now`. */
export function currentWeekKeys(now: Date): DateKey[] {
  const mon = mondayOf(now);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(d.getDate() + i);
    return dk(d);
  });
}

export function nextLevel(totalXP: number): { threshold: number; name: string } | null {
  const found = LEVELS.find(([t]) => t > totalXP);
  return found ? { threshold: found[0], name: found[1] } : null;
}

/**
 * Dia anterior ao início do período: a conta não existia, então não é falha nem
 * descanso — é ausência. Sem isso, quem cria a conta numa quinta abre a Análise e
 * vê segunda, terça e quarta reprovadas, e um heatmap de 16 semanas zerado.
 */
function beforeStart(startedAt: DateKey | null | undefined): (key: DateKey) => boolean {
  if (!startedAt) return () => false;
  return (key) => key < startedAt;
}

// ---------------------------------------------------------------- meta diária (7 dots)

/**
 * `weekend` = fim de semana pausado; `off` = dia declarado livre; `before` = dia
 * anterior ao início do período (a conta ainda não existia). Os três neutros. Um
 * sábado com janelas abertas é dia normal.
 */
export type GoalDotKind = 'before' | 'weekend' | 'off' | 'future' | 'met' | 'miss';

/** Por que um dia é neutro (fim de semana pausado / dia livre), ou null se ele conta. */
export type RestKindOf = (key: DateKey) => RestKind | null;

export interface GoalDot {
  key: DateKey;
  /** 0 = segunda. */
  dayIdx: number;
  kind: GoalDotKind;
  done: number;
  isToday: boolean;
}

export interface GoalWeek {
  metCount: number;
  totalDays: number;
  dots: GoalDot[];
}

export function goalWeek(
  stats: Pick<Stats, 'dayMetGoal' | 'dayStudyDoneMins'>,
  opts: { now: Date; restKind?: RestKindOf; startedAt?: DateKey | null },
): GoalWeek {
  const weekKeys = currentWeekKeys(opts.now);
  const todayKey = dk(opts.now);
  const rest: RestKindOf = (key) => opts.restKind?.(key) ?? null;
  const before = beforeStart(opts.startedAt);
  const considered = weekKeys.filter((k) => !before(k) && rest(k) === null);
  const passed = considered.filter((k) => k <= todayKey);
  return {
    metCount: passed.filter((k) => stats.dayMetGoal[k]).length,
    totalDays: considered.length,
    dots: weekKeys.map((key, dayIdx) => {
      const done = stats.dayStudyDoneMins[key] || 0;
      const r = rest(key);
      const kind: GoalDotKind =
        before(key) ? 'before'
        : r === 'weekend' ? 'weekend'
        : r === 'off' ? 'off'
        : key > todayKey ? 'future'
        : stats.dayMetGoal[key] ? 'met'
        : 'miss';
      return { key, dayIdx, kind, done, isToday: key === todayKey };
    }),
  };
}

// ---------------------------------------------------------------- realizado (contra a meta)

export interface Adherence {
  /** Minutos de estudo cumpridos no período — inclusive em dia que não cobra meta. */
  done: number;
  /** A meta do período: meta diária × dias que contam e já chegaram. */
  goal: number;
  /** O que o plano reservou no período. Contexto: é o teto do dia, não a expectativa. */
  planned: number;
  /** `done` sobre `goal`. Passa de 100 quando se estuda além da meta — e isso é pra aparecer. */
  pct: number;
  met: boolean;
  /** Nenhum dia cobra meta ainda (antes de começar, folga): não há o que reprovar. */
  empty: boolean;
}

/**
 * A régua do card "Realizado". É a **meta diária**, não o plano cheio: o plano de
 * um dia padrão tem 6h40, e medir contra ele fazia bater a meta de 60 min aparecer
 * como 19% em laranja — na mesma tela em que o dot da meta ficava verde. Duas
 * réguas discordando sobre o mesmo dia. O plano continua no card, como contexto.
 *
 * Estudar em dia de folga entra no `done` e não infla o `goal`: na folga o extra
 * ajuda, nunca cobra.
 */
export function adherence(
  stats: Pick<Stats, 'dayStudyDoneMins' | 'dayStudyPlanned'>,
  keys: DateKey[],
  opts: { now: Date; dailyGoal: number; restKind?: RestKindOf; startedAt?: DateKey | null },
): Adherence {
  const todayKey = dk(opts.now);
  const before = beforeStart(opts.startedAt);
  const cobra = (key: DateKey) => key <= todayKey && !before(key) && (opts.restKind?.(key) ?? null) === null;
  let done = 0;
  let planned = 0;
  let dias = 0;
  for (const key of keys) {
    done += stats.dayStudyDoneMins[key] || 0;
    planned += stats.dayStudyPlanned[key] || 0;
    if (cobra(key)) dias++;
  }
  const goal = dias * Math.max(0, opts.dailyGoal);
  return {
    done,
    goal,
    planned,
    pct: goal > 0 ? Math.round((done / goal) * 100) : 0,
    met: goal > 0 && done >= goal,
    empty: goal === 0,
  };
}

// ---------------------------------------------------------------- heatmap 7 × N semanas

export const HEAT_COLORS = ['var(--heat0)', 'var(--heat1)', 'var(--heat2)', 'var(--heat3)', 'var(--heat4)'] as const;

export interface HeatCell {
  key: DateKey;
  date: Date;
  /** `day-off` = dia declarado livre e `before` = antes do início do período: neutros como o fim de semana. */
  kind: 'future' | 'before' | 'weekend-off' | 'day-off' | 'value';
  /** 0–4, índice em HEAT_COLORS. */
  intensity: number;
  done: number;
  pct: number;
  isToday: boolean;
}

/** Células em ordem de coluna (semana) e depois linha (dia) — o grid usa `grid-auto-flow: column`. */
export function heatmap(
  dayStudyDoneMins: Record<DateKey, number>,
  opts: { now: Date; goal: number; weeks?: number; restKind?: RestKindOf; startedAt?: DateKey | null },
): HeatCell[] {
  const weeks = opts.weeks ?? 16;
  const today = new Date(opts.now);
  today.setHours(0, 0, 0, 0);
  const todayKey = dk(today);
  const startMon = mondayOf(today);
  startMon.setDate(startMon.getDate() - 7 * (weeks - 1));
  const before = beforeStart(opts.startedAt);
  const cells: HeatCell[] = [];
  for (let col = 0; col < weeks; col++) {
    for (let row = 0; row < 7; row++) {
      const d = new Date(startMon);
      d.setDate(d.getDate() + col * 7 + row);
      const key = dk(d);
      const done = dayStudyDoneMins[key] || 0;
      if (d > today) {
        cells.push({ key, date: d, kind: 'future', intensity: 0, done, pct: 0, isToday: false });
        continue;
      }
      if (before(key)) {
        cells.push({ key, date: d, kind: 'before', intensity: 0, done, pct: 0, isToday: false });
        continue;
      }
      const rest = opts.restKind?.(key) ?? null;
      if (rest === 'weekend') {
        cells.push({ key, date: d, kind: 'weekend-off', intensity: 0, done, pct: 0, isToday: false });
        continue;
      }
      if (rest === 'off') {
        cells.push({ key, date: d, kind: 'day-off', intensity: 0, done, pct: 0, isToday: false });
        continue;
      }
      let intensity: number;
      let pct: number;
      if (opts.goal <= 0) {
        intensity = done > 0 ? 4 : 0;
        pct = done > 0 ? 100 : 0;
      } else {
        const raw = (done / opts.goal) * 100;
        intensity = raw >= 100 ? 4 : Math.min(4, Math.floor(raw / 25));
        pct = Math.round(raw);
      }
      cells.push({ key, date: d, kind: 'value', intensity, done, pct, isToday: key === todayKey });
    }
  }
  return cells;
}

// ---------------------------------------------------------------- horas do dia

export interface HourBar {
  hour: number;
  count: number;
  /** Altura relativa ao pico, 0–100. */
  pct: number;
}

export function hourBars(hourCounts: Record<number, number>, start: TimeString, end: TimeString): HourBar[] {
  const startH = parseInt(start.split(':')[0] as string, 10);
  const endH = parseInt(end.split(':')[0] as string, 10) + 1;
  const hours: number[] = [];
  for (let h = startH; h <= endH; h++) hours.push(h);
  const max = Math.max(...hours.map((h) => hourCounts[h] || 0), 1);
  return hours.map((hour) => {
    const count = hourCounts[hour] || 0;
    return { hour, count, pct: Math.round((count / max) * 100) };
  });
}

// ---------------------------------------------------------------- conclusão por sessão

export interface DropoffRow {
  session: number;
  done: number;
  total: number;
  pct: number;
}

export function dropoff(sessionStats: Stats['sessionStats']): DropoffRow[] {
  return Object.keys(sessionStats)
    .map(Number)
    .sort((a, b) => a - b)
    .filter((s) => sessionStats[s]!.total > 0)
    .map((session) => {
      const { done, total } = sessionStats[session]!;
      return { session, done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
    });
}

// ---------------------------------------------------------------- sparkline (8 semanas)

export interface Sparkline {
  series: Array<{ week: DateKey; mins: number }>;
  points: Array<[number, number]>;
  polyline: string;
  last: [number, number];
}

export function sparkline(
  dayStudyDoneMins: Record<DateKey, number>,
  now: Date,
  opts: { weeks?: number; width?: number; height?: number; pad?: number } = {},
): Sparkline {
  const weeks = opts.weeks ?? 8;
  const W = opts.width ?? 120;
  const H = opts.height ?? 24;
  const pad = opts.pad ?? 2;

  const byWeek: Record<DateKey, number> = {};
  for (const [key, mins] of Object.entries(dayStudyDoneMins)) {
    if (!mins) continue;
    const wk = dk(mondayOf(new Date(key + 'T00:00:00')));
    byWeek[wk] = (byWeek[wk] || 0) + mins;
  }
  const todayMon = mondayOf(now);
  const series = Array.from({ length: weeks }, (_, idx) => {
    const i = weeks - 1 - idx;
    const d = new Date(todayMon);
    d.setDate(d.getDate() - i * 7);
    const week = dk(d);
    return { week, mins: byWeek[week] || 0 };
  });
  const max = Math.max(...series.map((s) => s.mins), 1);
  const stepX = (W - pad * 2) / (series.length - 1);
  const points = series.map((s, i): [number, number] => [pad + i * stepX, H - pad - (s.mins / max) * (H - pad * 2)]);
  const polyline = points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return { series, points, polyline, last: points[points.length - 1]! };
}
