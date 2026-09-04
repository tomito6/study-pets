// O plano lido a partir do estado: semanas, blocos de cada dia e estatísticas.
// Único lugar que liga o domínio ao store — React e legado consomem daqui.

import { configForDay, isDayOff } from '../domain/dayWindows';
import { expandEventsForDate } from '../domain/events';
import { generateBlocks as generateBlocksPure } from '../domain/planner';
import { computeStats, calcStreaks } from '../domain/stats';
import type { Stats } from '../domain/stats';
import { dk } from '../domain/time';
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
      ...Object.keys(state.lunchOverrides),
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

/**
 * Todos os dias que contam. Fim de semana com `skipWeekends` fica de fora.
 * ALTERNATIVA: o dia declarado livre CONTA — 0 planejado, meta não batida —
 * e por isso quebra a sequência como um dia sem estudo (na branch principal
 * ele fica de fora, neutro como o fim de semana).
 */
export const allDays = (): WeekDay[] => weekDays(derived.weeks, state.config.skipWeekends === true);

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
  if (state.config.skipWeekends) {
    const dow = new Date(dateKey + 'T12:00:00').getDay(); // 0=dom, 6=sáb
    if (dow === 0 || dow === 6) return [];
  }
  const windowOv = state.windowOverrides[dateKey];
  if (isDayOff(windowOv)) return [];
  const events = getEventsForDate(dateKey);
  const dayCfg = configForDay(state.config, windowOv); // as janelas só deste dia, se houver
  const lunchOv = state.lunchOverrides[dateKey];
  const cfg = lunchOv ? { ...dayCfg, ...lunchOv } : dayCfg;
  return generateBlocks(cfg, events);
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
  });
  statsCache = { key, stats };
  return stats;
}

export function calcStreaksNow(dayStudyMins: Record<DateKey, number>, now: Date = new Date()) {
  return calcStreaks(
    dayStudyMins,
    allDays().map((d) => d.key),
    dk(now),
    state.config.dailyStudyMin || 60,
  );
}
