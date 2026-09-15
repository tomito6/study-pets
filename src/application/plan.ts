// O plano lido a partir do estado: semanas, blocos de cada dia e estatísticas.
// Único lugar que liga o domínio ao store — React e legado consomem daqui.

import { configAt } from '../domain/configHistory';
import { configForDay, isBonusDay, restDayKind } from '../domain/dayWindows';
import { modeForDay } from '../domain/dayMode';
import type { DayMode } from '../domain/dayMode';
import type { RestKind } from '../domain/dayWindows';
import { expandEventsForDate } from '../domain/events';
import { blockagesOnly, generateBlocks as generateBlocksPure } from '../domain/planner';
import { computeStats, calcStreaks } from '../domain/stats';
import type { Stats } from '../domain/stats';
import { dk, isWeekendKey } from '../domain/time';
import type { DateKey, PauseRecord, PlannerConfig, StudyBlock, StudyEvent, UserConfig } from '../domain/types';
import { buildWeeks, dateForWeekDay as dateForWeekDayIn, findWeek as findWeekIn, weekDays } from '../domain/weeks';
import type { WeekDay } from '../domain/weeks';
import { isDayClosed } from '../domain/checks';
import { derived, getVersion, notify, setView, state } from '../store/store';

// ---------------------------------------------------------------- gerador memoizado
// Memoização é preocupação de performance da UI, não regra de domínio — por isso mora aqui.
const blockCache = new Map<string, StudyBlock[]>();

export function generateBlocks(cfg: PlannerConfig, events: StudyEvent[] = [], pauses: PauseRecord[] = []): StudyBlock[] {
  const cacheKey = JSON.stringify({ cfg, events, pauses });
  const hit = blockCache.get(cacheKey);
  if (hit) return hit;
  const blocks = generateBlocksPure(cfg, events, pauses);
  blockCache.set(cacheKey, blocks);
  if (blockCache.size > 500) {
    for (const k of [...blockCache.keys()].slice(0, 250)) blockCache.delete(k);
  }
  return blocks;
}

/** Sempre que config, eventos ou as pausas de um dia mudarem. */
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
      ...Object.keys(state.pauses ?? {}),
    ],
    today: now,
  });
  notify();
}

export const dateForWeekDay = (weekN: number, dayIdx: number): Date =>
  dateForWeekDayIn(derived.weeks, weekN, dayIdx);

export const findWeek = (date: Date): number => findWeekIn(derived.weeks, date);

/**
 * Põe a semana/dia visíveis em cima de HOJE. O boot e a virada da meia-noite
 * chamam o mesmo caminho — a conta morava só dentro do `initAfterLoad`, e por
 * isso a virada com o app aberto não tinha como reaproveitá-la.
 *
 * O índice do dia sai do tempo decorrido desde a segunda, com teto em 6. Parece
 * frágil perto do horário de verão, mas não é: na UE a virada cai sempre no
 * DOMINGO, o último dia da semana exibida, onde o teto já segura — conferido em
 * Europe/Berlin contra a conta por data de calendário, 2025–2027, sem uma
 * divergência. Ficou como estava de propósito: isto é extração, não mudança.
 */
export function viewToday(now: Date = new Date()): void {
  const semana = findWeek(now);
  const w = derived.weeks[semana - 1];
  const dia = w ? Math.min(6, Math.max(0, Math.floor((now.getTime() - w.start.getTime()) / 86400000))) : 0;
  setView(semana, dia);
}

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

/** De que jeito este dia nasce: pela rotina (o padrão) ou ao vivo. */
export const dayModeOf = (dateKey: DateKey): DayMode => modeForDay(dateKey, state.dayModes, state.dayModeDefault);

/**
 * A config que valia neste dia: a atual, ou a versão que valia antes de uma mudança de
 * ritmo/janelas (ver domain/configHistory.ts). Tudo que gera ou lê o plano de um dia
 * passa por aqui — nunca por `state.config` direto —, senão a mudança de dezembro
 * reescreve setembro.
 */
export const configAtDay = (dateKey: DateKey): UserConfig => configAt(state.config, state.configHistory, dateKey);

/**
 * O dia já tem algo que o plano não pode mais mexer: check, encerramento, pausa registrada,
 * desistência, corrida do modo ao vivo, ou o bloco que está no timer. É o que decide se uma
 * mudança de config vale de hoje ou só de amanhã.
 */
export function dayHasFacts(dateKey: DateKey): boolean {
  if (Object.keys(state.checks[dateKey] ?? {}).length > 0) return true;
  if (isDayClosed(state.closedDays, dateKey)) return true;
  if ((state.pauses?.[dateKey]?.length ?? 0) > 0) return true;
  if ((state.penalties?.[dateKey]?.length ?? 0) > 0) return true;
  if (state.windowOverrides[dateKey]?.studyWindows.some((w) => w.live)) return true;
  return !!derived.timerBlock && derived.timerDay === dateKey;
}

export function blocksForDay(dateKey: DateKey): StudyBlock[] {
  if (restKindOf(dateKey) !== null) return []; // fim de semana pausado (sem janelas do dia) ou dia livre
  const windowOv = state.windowOverrides[dateKey];
  const events = getEventsForDate(dateKey);
  // Dia ao vivo que ainda não começou não tem PLANO nenhum — é o ponto do modo —, mas
  // tem os compromissos dele: a aula das 10h e a refeição das 13h existem, e precisam
  // aparecer. Sem isso elas ficavam invisíveis até a primeira corrida e então apareciam
  // (o gerador emite bloqueios que caem depois da janela): o compromisso piscava na tela.
  //
  // Não dá pra chamar o gerador aqui: com `studyWindows: []` ele cai no fallback
  // `cfg.start`/`cfg.end`, e `deriveStartEnd([])` devolve 09:00–18:00 — o dia que não
  // começou nasceria com o plano inteiro, 33 blocos que ninguém pediu.
  if (!windowOv && dayModeOf(dateKey) === 'live') return blockagesOnly(events);
  const dayCfg = configForDay(configAtDay(dateKey), windowOv); // a config que valia no dia, com as janelas só dele, se houver
  return generateBlocks(dayCfg, events, state.pauses?.[dateKey] ?? []); // e as pausas do timer daquele dia
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
