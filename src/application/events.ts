// Casos de uso de eventos e do almoço de um dia. Cada mutação: limpa o cache do
// gerador, agenda o save, notifica, e conta ao usuário o que mudou no plano.

import { describePlanDelta, planDelta } from '../domain/planDelta';
import { timeToMins } from '../domain/time';
import type { DateKey, RecurrenceFreq, RecurringEventSeries, StudyBlock, StudyEvent, TimeString } from '../domain/types';
import type { LunchOverride } from '../domain/persistence';
import { showToast } from '../shared/toast';
import { notify, state } from '../store/store';
import { blocksForDay, clearBlockCache } from './plan';
import { scheduleSave } from './save';

export interface EventInput {
  name: string;
  start: TimeString;
  end: TimeString;
  countsAsStudy: boolean;
}

export interface SeriesInput extends EventInput {
  /** Dias no formato de `Date.getDay()` — 0 = domingo. */
  weekdays: number[];
  freq: RecurrenceFreq;
  until: DateKey | null;
}

export type EventValidation = { ok: true } | { ok: false; reason: 'end-before-start' | 'no-weekdays' };

export function validateEvent(input: EventInput): EventValidation {
  if (timeToMins(input.end) <= timeToMins(input.start)) return { ok: false, reason: 'end-before-start' };
  return { ok: true };
}

export function validateSeries(input: SeriesInput): EventValidation {
  const base = validateEvent(input);
  if (!base.ok) return base;
  if (input.weekdays.length === 0) return { ok: false, reason: 'no-weekdays' };
  return { ok: true };
}

/** Toast com o que mudou no plano do dia — silencioso se nada relevante mudou. */
export function notifyPlanDelta(dateKey: DateKey, before: StudyBlock[]): void {
  const msg = describePlanDelta(planDelta(before, blocksForDay(dateKey)));
  if (msg) showToast(msg);
}

function commit(dateKey: DateKey, before: StudyBlock[]): void {
  clearBlockCache();
  scheduleSave();
  notify();
  notifyPlanDelta(dateKey, before);
}

const cleanName = (name: string) => name.trim() || 'Evento';

export function addEvent(dateKey: DateKey, input: EventInput): void {
  const before = blocksForDay(dateKey);
  const day = state.events[dateKey] ?? (state.events[dateKey] = []);
  day.push({ name: cleanName(input.name), start: input.start, end: input.end, countsAsStudy: input.countsAsStudy });
  commit(dateKey, before);
}

const newSeriesId = () => `ser_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export function addEventSeries(anchorKey: DateKey, input: SeriesInput): void {
  const before = blocksForDay(anchorKey);
  if (!state.eventSeries) state.eventSeries = [];
  const series: RecurringEventSeries = {
    id: newSeriesId(),
    name: cleanName(input.name),
    start: input.start,
    end: input.end,
    weekdays: input.weekdays,
    freq: input.freq,
    anchor: anchorKey,
    until: input.until,
    exceptions: [],
    countsAsStudy: input.countsAsStudy,
  };
  state.eventSeries.push(series);
  commit(anchorKey, before);
}

/** Apaga um evento avulso do dia, identificado pelo horário de início. */
export function deleteEvent(dateKey: DateKey, startTime: TimeString): void {
  const before = blocksForDay(dateKey);
  const events = state.events[dateKey] || [];
  const idx = events.findIndex((ev) => ev.start === startTime);
  if (idx >= 0) {
    events.splice(idx, 1);
    if (events.length === 0) delete state.events[dateKey];
  }
  commit(dateKey, before);
}

/** "Só este dia": o dia vira exceção da série. */
export function deleteSeriesOccurrence(seriesId: string, dateKey: DateKey): void {
  const before = blocksForDay(dateKey);
  const s = (state.eventSeries || []).find((x) => x.id === seriesId);
  if (s) {
    if (!Array.isArray(s.exceptions)) s.exceptions = [];
    if (!s.exceptions.includes(dateKey)) s.exceptions.push(dateKey);
  }
  commit(dateKey, before);
}

/** "Apagar a série": some de todos os dias. */
export function deleteSeries(seriesId: string, dateKey: DateKey): void {
  const before = blocksForDay(dateKey);
  state.eventSeries = (state.eventSeries || []).filter((x) => x.id !== seriesId);
  commit(dateKey, before);
}

// ---- editar ----

export type EventUpdateResult = { ok: true } | { ok: false; reason: 'end-before-start' | 'no-weekdays' | 'not-found' };

/** O que o painel de edição recebe: o evento avulso do dia, ou a série inteira. */
export type EventEditTarget =
  | { kind: 'single'; dateKey: DateKey; event: StudyEvent }
  | { kind: 'series'; series: RecurringEventSeries };

/**
 * O evento por trás de um bloco do plano — a série, se ele veio de uma; senão o
 * avulso do dia com o mesmo início. `null` se o plano mudou por baixo.
 */
export function findEventEditTarget(dateKey: DateKey, block: Pick<StudyBlock, 'time' | '_seriesId'>): EventEditTarget | null {
  if (block._seriesId) {
    const series = (state.eventSeries || []).find((s) => s.id === block._seriesId);
    return series ? { kind: 'series', series } : null;
  }
  const event = (state.events[dateKey] || []).find((ev) => ev.start === block.time);
  return event ? { kind: 'single', dateKey, event } : null;
}

/**
 * Substitui um evento avulso do dia (identificado pelo início antigo). O check
 * gravado no horário antigo fica órfão se o início mudar — igual ao apagar.
 */
export function updateEvent(dateKey: DateKey, oldStart: TimeString, input: EventInput): EventUpdateResult {
  const v = validateEvent(input);
  if (!v.ok) return v;
  const events = state.events[dateKey] || [];
  const idx = events.findIndex((ev) => ev.start === oldStart);
  if (idx < 0) return { ok: false, reason: 'not-found' };
  const before = blocksForDay(dateKey);
  events[idx] = { name: cleanName(input.name), start: input.start, end: input.end, countsAsStudy: input.countsAsStudy };
  commit(dateKey, before);
  return { ok: true };
}

/**
 * Edita a série inteira: nome, horário, dias, frequência, "até" e "conta como
 * estudo". `id`, `anchor` e `exceptions` ficam — os dias já apagados continuam
 * apagados. Editar uma ocorrência só continua fora do escopo ("Só este dia" + avulso).
 */
export function updateSeries(seriesId: string, input: SeriesInput, dateKey: DateKey): EventUpdateResult {
  const v = validateSeries(input);
  if (!v.ok) return v;
  const s = (state.eventSeries || []).find((x) => x.id === seriesId);
  if (!s) return { ok: false, reason: 'not-found' };
  const before = blocksForDay(dateKey);
  s.name = cleanName(input.name);
  s.start = input.start;
  s.end = input.end;
  s.weekdays = [...input.weekdays];
  s.freq = input.freq;
  s.until = input.until;
  s.countsAsStudy = input.countsAsStudy;
  commit(dateKey, before);
  return { ok: true };
}

// ---- almoço do dia ----

export function lunchForDay(dateKey: DateKey): Required<Pick<LunchOverride, 'lunch' | 'lunchDur'>> {
  const ov = state.lunchOverrides[dateKey];
  return {
    lunch: ov?.lunch ?? state.config.lunch,
    lunchDur: ov?.lunchDur ?? state.config.lunchDur,
  };
}

export function setLunchOverride(dateKey: DateKey, lunch: TimeString, lunchDur: number): void {
  const before = blocksForDay(dateKey);
  state.lunchOverrides[dateKey] = { lunch, lunchDur };
  commit(dateKey, before);
}
