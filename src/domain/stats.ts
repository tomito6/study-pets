// Estatísticas do app, calculadas numa passada só sobre os dias.
// Puro: recebe os dias, os blocos de cada dia e os checks, e devolve números.

import type { ChecksByDate, DateKey, StudyBlock } from './types';
import { coinsForBlock, dailyBonusForStreak, xpFromCheck } from './progression';
import { timeToMins } from './time';
import { isChecked } from './checks';

/** Um dia a considerar, já resolvido por quem chama (que conhece WEEKS e skipWeekends). */
export interface StatsDay {
  key: DateKey;
  date: Date;
  /** Índice da semana, usado nos agregados por semana. */
  weekIdx: number;
}

export interface StatsInput {
  days: StatsDay[];
  /** Blocos de um dia. Quem chama decide como gerar (config, almoço, eventos). */
  getBlocks: (key: DateKey) => StudyBlock[];
  checks: ChecksByDate;
  /** Se o dia foi encerrado manualmente. */
  dayClosed: (key: DateKey) => boolean;
  todayKey: DateKey;
  /** Dia visível na UI — alimenta os contadores "de hoje" da aba Plano. */
  currentDayKey: DateKey;
  /** Índice da semana visível na UI. */
  currentWeekIdx: number;
  dailyStudyMin: number;
}

export interface Stats {
  totalXP: number;
  totalChecks: number;
  weekXP: Record<number, number>;
  weekChecks: Record<number, number>;
  todayXP: number;
  todayChecks: number;
  todayCoins: number;
  hourCounts: Record<number, number>;
  bestWeekChecks: number;
  bestDayChecks: number;
  bestDayLabel: string;
  bestDayXP: number;
  studyMins: number;
  coins: number;
  activeWeeks: number;
  estudosToday: { done: number; total: number };
  pausasToday: { done: number; total: number };
  weekChecksOfCurrent: number;
  dayCheckCounts: Record<DateKey, number>;
  dayStudyMins: Record<DateKey, number>;
  dayStudyPlanned: Record<DateKey, number>;
  dayStudyDoneMins: Record<DateKey, number>;
  dayMetGoal: Record<DateKey, boolean>;
  sessionStats: Record<number, { done: number; total: number }>;
}

/**
 * Calcula tudo numa iteração só — não quebrar isso em funções que reiteram os dias.
 *
 * Distinção central, preservada do comportamento original: XP, moedas, horas e
 * recordes só entram nos totais quando o dia **fechou** (é passado, ou hoje foi
 * encerrado à mão). Isso evita o exploit de marcar e desmarcar pra farmar. Os
 * contadores do próprio dia (`todayXP`, `todayCoins`, `dayStudyMins`) continuam
 * refletindo hoje, porque a UI mostra esses ganhos como "pendentes".
 *
 * Aderência (`dayStudyPlanned`/`dayStudyDoneMins`) inclui hoje de propósito: não
 * é recompensa, é diagnóstico.
 */
export function computeStats(input: StatsInput): Stats {
  const { checks, todayKey, currentDayKey, getBlocks, dayClosed } = input;

  const stats: Stats = {
    totalXP: 0, totalChecks: 0,
    weekXP: {}, weekChecks: {},
    todayXP: 0, todayChecks: 0, todayCoins: 0,
    hourCounts: {},
    bestWeekChecks: 0,
    bestDayChecks: 0, bestDayLabel: '—', bestDayXP: 0,
    studyMins: 0, coins: 0,
    activeWeeks: 0,
    estudosToday: { done: 0, total: 0 },
    pausasToday: { done: 0, total: 0 },
    weekChecksOfCurrent: 0,
    dayCheckCounts: {},
    dayStudyMins: {},
    dayStudyPlanned: {},
    dayStudyDoneMins: {},
    dayMetGoal: {},
    sessionStats: {},
  };

  const minDailyMins = input.dailyStudyMin || 60;
  let runningStreak = 0;

  for (const { key, date: d, weekIdx: wi } of input.days) {
    // Dia "fechado" entra nos totais: dia passado OU encerrado manualmente hoje
    const isPast = key !== todayKey || dayClosed(key);
    const blocks = getBlocks(key);
    let dayXP = 0;
    let dayChecks = 0;
    let dayStudyMins = 0;
    let weekHasCheck = false;
    let dayPlanned = 0;
    let dayDone = 0;
    stats.weekXP[wi] = stats.weekXP[wi] || 0;
    stats.weekChecks[wi] = stats.weekChecks[wi] || 0;

    blocks.forEach((b) => {
      const isStudyLike = b.type === 'estudo' || b.type === 'event';
      if (isStudyLike) {
        const dur = timeToMins(b.endTime) - timeToMins(b.time);
        dayPlanned += dur;
        if (isChecked(checks, key, b.time)) dayDone += dur;
        if (isPast) {
          const s = b.session ?? 0;
          if (!stats.sessionStats[s]) stats.sessionStats[s] = { done: 0, total: 0 };
          stats.sessionStats[s]!.total++;
          if (isChecked(checks, key, b.time)) stats.sessionStats[s]!.done++;
        }
      }
      if (!isStudyLike && b.type !== 'pausa') return;
      if (key === currentDayKey) {
        if (isStudyLike) stats.estudosToday.total++;
        else stats.pausasToday.total++;
      }
      if (isChecked(checks, key, b.time)) {
        const dur = timeToMins(b.endTime) - timeToMins(b.time);
        // Counters do próprio dia (incluindo hoje) — usados pra streak/melhor dia
        dayChecks++;
        if (isStudyLike) dayStudyMins += dur;

        // XP efetivo do check (aplica bônus salvo no momento da marcação)
        const check = checks[key] && checks[key]![b.time];
        const effXP = xpFromCheck(b, check);

        if (isPast) {
          // Agregados só de dias fechados (XP/moedas/horas/etc.)
          stats.totalChecks++;
          stats.totalXP += effXP;
          dayXP += effXP;
          weekHasCheck = true;
          stats.weekXP[wi]! += effXP;
          stats.weekChecks[wi]!++;
          if (isStudyLike) {
            stats.coins += coinsForBlock(b, dur);
            stats.studyMins += dur;
          }
          const hour = parseInt(b.time.split(':')[0] as string);
          stats.hourCounts[hour] = (stats.hourCounts[hour] || 0) + 1;
        }

        if (key === todayKey) {
          stats.todayXP += effXP;
          stats.todayChecks++;
          if (isStudyLike) stats.todayCoins += coinsForBlock(b, dur);
        }
        if (key === currentDayKey) {
          if (isStudyLike) stats.estudosToday.done++;
          else stats.pausasToday.done++;
        }
      }
    });

    stats.dayCheckCounts[key] = dayChecks;
    stats.dayStudyMins[key] = dayStudyMins;
    stats.dayStudyPlanned[key] = dayPlanned;
    stats.dayStudyDoneMins[key] = dayDone;
    stats.dayMetGoal[key] = dayDone >= minDailyMins;
    if (dayStudyMins >= minDailyMins) {
      runningStreak++;
      // Bônus de streak só conta nas moedas se o dia já fechou
      if (isPast) stats.coins += dailyBonusForStreak(runningStreak);
      // Pra hoje (ainda aberto), expõe o bônus como pendente
      else if (key === todayKey) stats.todayCoins += dailyBonusForStreak(runningStreak);
    } else {
      runningStreak = 0;
    }
    if (dayChecks > stats.bestDayChecks) {
      stats.bestDayChecks = dayChecks;
      stats.bestDayLabel = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }
    if (dayXP > stats.bestDayXP) stats.bestDayXP = dayXP;
    if (weekHasCheck) stats.activeWeeks++;
    if (stats.weekChecks[wi]! > stats.bestWeekChecks) stats.bestWeekChecks = stats.weekChecks[wi]!;
  }

  stats.weekChecksOfCurrent = stats.weekChecks[input.currentWeekIdx] || 0;
  return stats;
}

/** Sequência atual e maior sequência, a partir dos minutos estudados por dia. */
export function calcStreaks(
  dayStudyMins: Record<DateKey, number>,
  dayKeys: DateKey[],
  todayKey: DateKey,
  minMins: number,
): { cur: number; best: number } {
  let cur = 0;
  let best = 0;
  let temp = 0;
  dayKeys.forEach((k) => {
    if ((dayStudyMins[k] || 0) >= minMins) {
      temp++;
      if (temp > best) best = temp;
    } else {
      temp = 0;
    }
  });
  const idx = dayKeys.indexOf(todayKey);
  if (idx >= 0) {
    for (let i = idx; i >= 0; i--) {
      if ((dayStudyMins[dayKeys[i] as DateKey] || 0) >= minMins) cur++;
      else break;
    }
  }
  return { cur, best };
}
