// O plano lido a partir do estado: semanas, blocos de cada dia e estatísticas.
// Único lugar que liga o domínio ao store — React e legado consomem daqui.

import { configForDay, isBonusDay, restDayKind } from '../domain/dayWindows';
import type { RestKind } from '../domain/dayWindows';
import { expandEventsForDate } from '../domain/events';
import { generateBlocks as generateBlocksPure } from '../domain/planner';
import { computeStats, calcStreaks } from '../domain/stats';
import type { Stats } from '../domain/stats';
import { dk, isWeekendKey } from '../domain/time';
import type { DateKey, PlannerConfig, StudyBlock, StudyEvent } from '../domain/types';
import { buildWeeks, dateForWeekDay as dateForWeekDayIn, findWeek as findWeekIn, weekDays } from '../domain/weeks';
import type { WeekDay } from '../domain/weeks';
import { isDayClosed } from '../domain/checks';
import { derived, getVersion, notify, state } from '../store/store';

// ---------------------------------------------------------------- gerador memoizado
// Memoização é preocupação de performance da UI, não regra de domínio — por isso mora aqui.
const blockCache = new Map<string, StudyBlock[]>();

export function generateBlocks(cfg: PlannerConfig, events: StudyEvent[] = []): StudyBlock[] {
  const cacheKey = JSON.stringify({ cfg, events });
  const hit = blockCache.get(cacheKey);
  if (hit) return hit;
  const blocks = generateBlocksPure(cfg, events);
  blockCache.set(cacheKey, blocks);
  if (blockCache.size > 500) {
    for (const k of [...blockCache.keys()].slice(0, 250)) blockCache.delete(k);
  }
  return blocks;
}

/** Sempre que config ou eventos mudarem. */
export function clearBlockCache(): void {
  blockCache.clear();
  statsCache = null;
}

// ---------------------------------------------------------------- semanas
export function rebuildWeeks(now: Date = new Date()): void {
  derived.weeks = buildWeeks({
    periodStart: state.config.periodStart,
    periodEnd: state.config.periodEnd,
    dataKeys: [
      ...Object.keys(state.checks),
      ...Object.keys(state.events),
      ...Object.keys(state.groups),
      ...Object.keys(state.windowOverrides),
    ],
    today: now,
  });
  notify();
}

export const dateForWeekDay = (weekN: number, dayIdx: number): Date =>
  dateForWeekDayIn(derived.weeks, weekN, dayIdx);

export const findWeek = (date: Date): number => findWeekIn(derived.weeks, date);

// ---------------------------------------------------------------- descanso
const restInputFor = (dateKey: DateKey, isWeekend = isWeekendKey(dateKey)) => ({
  skipWeekends: state.config.skipWeekends === true,
  isWeekend,
  override: state.windowOverrides[dateKey],
});

/** Por que o dia está sem blocos — fim de semana pausado ou dia declarado livre — ou null se ele conta. */
export const restKindOf = (dateKey: DateKey): RestKind | null => restDayKind(restInputFor(dateKey));

/** Fim de semana pausado em que o usuário abriu janelas: um dia a mais, nunca uma obrigação. */
export const isBonusDayKey = (dateKey: DateKey): boolean => isBonusDay(restInputFor(dateKey));

/** Um dia que conta, com a marca de dia bônus (ver `isBonusDay`). */
export type PlanDay = WeekDay & { bonus: boolean };

/**
 * Todos os dias que contam. Fim de semana com `skipWeekends` e dia declarado
 * livre ficam de fora do mesmo jeito: neutros — não quebram a sequência nem
 * contam como meta batida, e não têm minuto planejado. Um fim de semana em que
 * o usuário abriu janelas entra, como dia bônus.
 */
export function allDays(): PlanDay[] {
  const out: PlanDay[] = [];
  for (const d of weekDays(derived.weeks, false)) {
    const input = restInputFor(d.key, d.dayIdx >= 5);
    if (restDayKind(input) !== null) continue;
    out.push({ ...d, bonus: isBonusDay(input) });
  }
  return out;
}

/** Compatibilidade com o legado, que itera dias com callback. */
export function forEachDay(cb: (key: DateKey, date: Date, weekIdx: number, dayIdx: number) => void): void {
  for (const d of allDays()) cb(d.key, d.date, d.weekIdx, d.dayIdx);
}

/** Chave do dia visível na aba Plano. */
export const currentDayKey = (): DateKey => dk(dateForWeekDay(state.uiWeek, state.uiDay));

// ---------------------------------------------------------------- blocos do dia
export function getEventsForDate(dateKey: DateKey): StudyEvent[] {
  return expandEventsForDate(dateKey, state.events, state.eventSeries || []);
}

export function blocksForDay(dateKey: DateKey): StudyBlock[] {
  if (restKindOf(dateKey) !== null) return []; // fim de semana pausado (sem janelas do dia) ou dia livre
  const windowOv = state.windowOverrides[dateKey];
  const events = getEventsForDate(dateKey);
  const dayCfg = configForDay(state.config, windowOv); // as janelas só deste dia, se houver
  return generateBlocks(dayCfg, events);
}

// ---------------------------------------------------------------- estatísticas
// Memoizadas pela versão do store e pelo dia: quem chama várias vezes por render
// (cabeçalho, Plano, legado) paga uma passada só.
let statsCache: { key: string; stats: Stats } | null = null;

export function computeStatsNow(now: Date = new Date()): Stats {
  const todayKey = dk(now);
  const key = `${getVersion()}|${todayKey}|${derived.weeks.length}`;
  if (statsCache && statsCache.key === key) return statsCache.stats;
  const stats = computeStats({
    days: allDays(),
    getBlocks: blocksForDay,
    checks: state.checks,
    dayClosed: (k) => isDayClosed(state.closedDays, k),
    todayKey,
    currentDayKey: currentDayKey(),
    currentWeekIdx: state.uiWeek - 1,
    dailyStudyMin: state.config.dailyStudyMin || 60,
    penalties: state.penalties,
  });
  statsCache = { key, stats };
  return stats;
}

export function calcStreaksNow(dayStudyMins: Record<DateKey, number>, now: Date = new Date()) {
  const min = state.config.dailyStudyMin || 60;
  // Dia bônus só entra se bateu a meta: estudar na folga nunca quebra a sequência.
  const keys = allDays()
    .filter((d) => !d.bonus || (dayStudyMins[d.key] || 0) >= min)
    .map((d) => d.key);
  return calcStreaks(dayStudyMins, keys, dk(now), min);
}
