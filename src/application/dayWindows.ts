// Casos de uso das janelas de um dia: editar só as de hoje (ou de um dia futuro),
// "começar agora", declarar dia livre e restaurar a rotina. Cada mutação: limpa o
// cache do gerador, refaz as semanas (a data entra nas que expandem o período),
// salva, notifica, conta o que mudou no plano e reagenda o prompt de fim de dia.
//
// Regras: dia encerrado é read-only; dia passado também (mexer nas janelas de
// ontem só mudaria estatística); dia futuro pode — planejar é o ponto. Dia livre
// só antes de qualquer check de hoje: declarar depois de falhar seria o "streak
// freeze", padrão manipulativo que o app evita. Fim de semana pausado (`skipWeekends`)
// é um dia livre implícito: abrir janelas nele vale só pra aquele sábado — os outros
// continuam de folga — e "Restaurar rotina" devolve a folga.

import { isDayClosed } from '../domain/checks';
import { routineAfter, startNowWindows, validateDayWindows, windowsForDay } from '../domain/dayWindows';
import type { DayWindowsOverride, RestKind } from '../domain/dayWindows';
import type { DayMode } from '../domain/dayMode';
import { dk, isWeekendKey } from '../domain/time';
import type { DateKey, StudyBlock, StudyWindow, TimeString } from '../domain/types';
import { notify, state } from '../store/store';
import { rescheduleEndOfDayPrompt } from './dayEnd';
import { notifyPlanDelta } from './events';
import { blocksForDay, clearBlockCache, dayModeOf, rebuildWeeks, restKindOf } from './plan';
import { scheduleSave } from './save';

export type DayWindowsRefusal =
  | 'closed'
  | 'past'
  | 'not-today'
  | 'has-checks'
  | 'empty'
  | 'invalid-window'
  | 'overlap'
  | 'nothing-left';

export type DayWindowsResult = { ok: true } | { ok: false; reason: DayWindowsRefusal };
export type StartNowOutcome = { ok: true; start: TimeString } | { ok: false; reason: DayWindowsRefusal };

export const dayWindowsOverride = (dateKey: DateKey): DayWindowsOverride | null => state.windowOverrides[dateKey] ?? null;

/** As janelas que valem pro dia: as editadas; nenhuma no fim de semana pausado; senão as da rotina. */
export const effectiveWindows = (dateKey: DateKey): StudyWindow[] =>
  windowsForDay(state.config, dayWindowsOverride(dateKey), isWeekendKey(dateKey));

/** Por que o dia está sem blocos (fim de semana pausado / dia livre), ou null. */
export const restKindKey = (dateKey: DateKey): RestKind | null => restKindOf(dateKey);
export const isRestDayKey = (dateKey: DateKey): boolean => restKindOf(dateKey) !== null;

export function canEditDayWindows(dateKey: DateKey, now: Date = new Date()): DayWindowsResult {
  if (isDayClosed(state.closedDays, dateKey)) return { ok: false, reason: 'closed' };
  if (dateKey < dk(now)) return { ok: false, reason: 'past' };
  return { ok: true };
}

function commit(dateKey: DateKey, before: StudyBlock[], now: Date): void {
  clearBlockCache();
  rebuildWeeks(now);
  scheduleSave();
  notify();
  notifyPlanDelta(dateKey, before);
  if (dateKey === dk(now)) rescheduleEndOfDayPrompt(now); // o último estudo de hoje pode ter mudado
}

/**
 * Troca o modo de um dia: **pela rotina** ou **ao vivo**.
 *
 * Trocar não mexe no que já foi vivido. Num dia que já tem corrida (a pessoa começou,
 * parou, e agora quer a rotina de volta), a rotina entra só de agora em diante — é o
 * mesmo `routineAfter` do "Voltar ao padrão", pela mesma razão: curar um bloco parcial
 * devolveria XP que ninguém estudou. Indo pro ao vivo, o override some e o dia fica sem
 * plano dali pra frente; o que já aconteceu continua no lugar se houver corrida.
 */
export function setDayMode(dateKey: DateKey, mode: DayMode, now: Date = new Date()): DayWindowsResult {
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return can;
  if (dayModeOf(dateKey) === mode) return { ok: true };
  const before = blocksForDay(dateKey);
  const atual = state.windowOverrides[dateKey];
  const corridas = atual ? atual.studyWindows.filter((w) => w.live) : [];

  if (mode === 'rotina') {
    if (corridas.length > 0 && dateKey === dk(now)) {
      const r = routineAfter(corridas, state.config.studyWindows, now);
      if (r.ok) state.windowOverrides[dateKey] = { studyWindows: r.windows };
      else delete state.windowOverrides[dateKey];
    } else if (corridas.length > 0) {
      state.windowOverrides[dateKey] = { studyWindows: corridas };
    } else {
      delete state.windowOverrides[dateKey];
    }
    delete state.dayModes[dateKey];
  } else {
    // Ao vivo: o que já foi vivido fica; o resto do dia deixa de vir montado.
    if (corridas.length > 0) state.windowOverrides[dateKey] = { studyWindows: corridas };
    else delete state.windowOverrides[dateKey];
    state.dayModes[dateKey] = 'live';
  }
  commit(dateKey, before, now);
  return { ok: true };
}

/**
 * O padrão: de que jeito os dias NOVOS nascem. Vale **de hoje em diante** — o `since` é
 * gravado com a data de agora, e `modeForDay` só o consulta pra dias a partir dela.
 *
 * Sem o `since`, virar a chave pra "ao vivo" leria o passado inteiro como ao vivo: todo
 * dia sem janela editada (quase todos) devolveria plano vazio, e XP total, nível, moedas,
 * sequência, melhor dia e o heatmap sumiriam da tela num clique. Com ele, o histórico não
 * se mexe: quem olhar setembro vê setembro.
 *
 * Escolher "rotina" com um padrão de ao vivo em vigor não apaga o campo — grava rotina a
 * partir de hoje, senão os dias entre o `since` antigo e hoje mudariam de modo pra trás.
 */
export function setDefaultDayMode(mode: DayMode, now: Date = new Date()): void {
  state.dayModeDefault = { mode, since: dk(now) };
  clearBlockCache();
  rebuildWeeks(now);
  scheduleSave();
  notify();
}

export function setDayWindows(dateKey: DateKey, windows: StudyWindow[], now: Date = new Date()): DayWindowsResult {
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return can;
  const v = validateDayWindows(windows);
  if (!v.ok) return v;
  const before = blocksForDay(dateKey);
  state.windowOverrides[dateKey] = { studyWindows: windows.map((w) => ({ start: w.start, end: w.end })) };
  commit(dateKey, before, now);
  return { ok: true };
}

/** "Começar agora" — só hoje. Devolve o novo início, pro toast. */
export function startNow(dateKey: DateKey, now: Date = new Date()): StartNowOutcome {
  if (dateKey !== dk(now)) return { ok: false, reason: 'not-today' };
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return can;
  const r = startNowWindows(effectiveWindows(dateKey), now);
  if (!r.ok) return r;
  const set = setDayWindows(dateKey, r.windows, now);
  return set.ok ? { ok: true, start: r.start } : set;
}

/** Dia livre: sem blocos, e neutro na sequência (como fim de semana com `skipWeekends`). */
export function setDayOff(dateKey: DateKey, now: Date = new Date()): DayWindowsResult {
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return can;
  if (Object.keys(state.checks[dateKey] ?? {}).length > 0) return { ok: false, reason: 'has-checks' };
  const before = blocksForDay(dateKey);
  state.windowOverrides[dateKey] = { studyWindows: [] };
  commit(dateKey, before, now);
  return { ok: true };
}

/**
 * "Restaurar rotina" / "Voltar ao padrão": o dia volta a seguir a config.
 *
 * **Com corrida no dia, a rotina volta só de agora em diante** (`routineAfter`). Apagar o
 * override inteiro regeneraria o dia pela rotina e **curaria o bloco parcial**: quem parou
 * às 10:12 num pomo que ia até 10:25 tem um bloco de 12 minutos e 24 XP, e dois toques o
 * devolveriam com 25 minutos e 50 XP — o XP deixaria de ser proporcional exatamente no
 * fluxo que "Parar por aqui" existe pra servir, e pelo caminho honesto. O que foi vivido
 * fica; o que volta é o resto do dia.
 */
export function clearDayWindows(dateKey: DateKey, now: Date = new Date()): DayWindowsResult {
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return can;
  const atual = state.windowOverrides[dateKey];
  if (!atual) return { ok: true };
  const before = blocksForDay(dateKey);
  const corridas = atual.studyWindows.filter((w) => w.live);
  if (corridas.length > 0 && dateKey === dk(now)) {
    const r = routineAfter(corridas, state.config.studyWindows, now);
    if (r.ok) state.windowOverrides[dateKey] = { studyWindows: r.windows };
    else delete state.windowOverrides[dateKey];
  } else {
    delete state.windowOverrides[dateKey];
  }
  commit(dateKey, before, now);
  return { ok: true };
}
