// Casos de uso de eventos: avulsos e séries recorrentes (a refeição de todo dia é
// uma série como outra qualquer). Cada mutação: limpa o cache do gerador, agenda
// o save, notifica, e conta ao usuário o que mudou no plano.

import { isDayClosed } from '../domain/checks';
import { describePlanDelta, planDelta } from '../domain/planDelta';
import { dateFromKey, timeToMins } from '../domain/time';
import type { DateKey, RecurrenceFreq, RecurringEventSeries, StudyBlock, StudyEvent, TimeString } from '../domain/types';
import { strings } from '../shared/strings';
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

/**
 * Edita só a ocorrência deste dia ("almocei mais cedo hoje"): o dia vira exceção da
 * série e ganha um avulso com os valores novos. Os outros dias continuam iguais.
 */
export function updateSeriesOccurrence(seriesId: string, dateKey: DateKey, input: EventInput): EventUpdateResult {
  const v = validateEvent(input);
  if (!v.ok) return v;
  const s = (state.eventSeries || []).find((x) => x.id === seriesId);
  if (!s) return { ok: false, reason: 'not-found' };
  const before = blocksForDay(dateKey);
  if (!Array.isArray(s.exceptions)) s.exceptions = [];
  if (!s.exceptions.includes(dateKey)) s.exceptions.push(dateKey);
  const day = state.events[dateKey] ?? (state.events[dateKey] = []);
  day.push({ name: cleanName(input.name), start: input.start, end: input.end, countsAsStudy: input.countsAsStudy });
  commit(dateKey, before);
  return { ok: true };
}

// ---- mover (arrastar) ----

/**
 * Arrastar um evento é editar o horário dele — nada de campo novo no schema. O
 * que o arrasto acrescenta é a pergunta de escopo, que o painel de edição já
 * fazia com o chip "Aplicar a": numa série, mover pode valer só pra este dia
 * (exceção + avulso) ou pra série inteira.
 */
export type MoveScope = 'day' | 'series';

export interface EventMoveInput {
  /** Dia de destino — igual ao de origem no arrasto dentro do Dia; outro dia, só na Semana. */
  toDateKey: DateKey;
  start: TimeString;
  end: TimeString;
}

export type MoveRefusal = 'end-before-start' | 'not-found' | 'closed' | 'not-movable' | 'series-other-day';
export type EventMoveResult = { ok: true; scope: MoveScope } | { ok: false; reason: MoveRefusal };

/** Só evento e intervalo se mexem: estudo e pausa são gerados pelo planner. */
export const isMovableBlock = (b: Pick<StudyBlock, 'type'>): boolean => b.type === 'event' || b.type === 'intervalo';

/** Dia encerrado é somente leitura; dia futuro pode, porque planejar o amanhã é o ponto. */
export const canMoveEvents = (dateKey: DateKey): boolean => !isDayClosed(state.closedDays, dateKey);

/** Uma série tem duas respostas possíveis; um avulso não pergunta nada. */
export const moveNeedsScope = (block: Pick<StudyBlock, '_seriesId'>, sameDay: boolean): boolean =>
  !!block._seriesId && sameDay;

const eventInputFrom = (ev: Pick<StudyEvent, 'name' | 'countsAsStudy'>, input: EventMoveInput): EventInput => ({
  name: ev.name,
  start: input.start,
  end: input.end,
  countsAsStudy: ev.countsAsStudy !== false,
});

/** Move um avulso pra outro dia: sai da lista de lá, entra na de cá. */
function relocateSingle(from: DateKey, oldStart: TimeString, to: DateKey, input: EventInput): boolean {
  const events = state.events[from] || [];
  const idx = events.findIndex((ev) => ev.start === oldStart);
  if (idx < 0) return false;
  events.splice(idx, 1);
  if (events.length === 0) delete state.events[from];
  const day = state.events[to] ?? (state.events[to] = []);
  day.push({ name: input.name, start: input.start, end: input.end, countsAsStudy: input.countsAsStudy });
  return true;
}

/**
 * O evento por trás do bloco vai pro horário novo (e, na Semana, pro dia novo).
 * `scope` só muda alguma coisa quando o bloco veio de uma série.
 */
export function moveEvent(
  dateKey: DateKey,
  block: Pick<StudyBlock, 'time' | 'type' | '_seriesId'>,
  input: EventMoveInput,
  scope: MoveScope = 'day',
): EventMoveResult {
  if (!isMovableBlock(block)) return { ok: false, reason: 'not-movable' };
  if (!canMoveEvents(dateKey) || !canMoveEvents(input.toDateKey)) return { ok: false, reason: 'closed' };
  if (timeToMins(input.end) <= timeToMins(input.start)) return { ok: false, reason: 'end-before-start' };
  const target = findEventEditTarget(dateKey, block);
  if (!target) return { ok: false, reason: 'not-found' };
  const sameDay = input.toDateKey === dateKey;

  if (target.kind === 'series') {
    const ev = eventInputFrom(target.series, input);
    if (scope === 'series') {
      // Mudar o dia da semana da série inteira é outra conversa (mexeria em `weekdays`).
      if (!sameDay) return { ok: false, reason: 'series-other-day' };
      const r = updateSeries(
        target.series.id,
        { ...ev, weekdays: target.series.weekdays, freq: target.series.freq, until: target.series.until ?? null },
        dateKey,
      );
      if (r.ok) return { ok: true, scope };
      // `no-weekdays` não chega aqui: a série veio de um bloco que ela mesma gerou,
      // então tem pelo menos um dia. Se um dia chegar, some com o evento pro usuário.
      return { ok: false, reason: r.reason === 'no-weekdays' ? 'not-found' : r.reason };
    }
    // "Só este dia": o dia de origem vira exceção e o de destino ganha o avulso.
    const before = blocksForDay(dateKey);
    const s = target.series;
    if (!Array.isArray(s.exceptions)) s.exceptions = [];
    if (!s.exceptions.includes(dateKey)) s.exceptions.push(dateKey);
    const day = state.events[input.toDateKey] ?? (state.events[input.toDateKey] = []);
    day.push({ name: ev.name, start: ev.start, end: ev.end, countsAsStudy: ev.countsAsStudy });
    commitMove(dateKey, before, input, ev.name);
    return { ok: true, scope: 'day' };
  }

  const ev = eventInputFrom(target.event, input);
  if (sameDay) {
    const before = blocksForDay(dateKey);
    const events = state.events[dateKey] || [];
    const idx = events.findIndex((e) => e.start === block.time);
    if (idx < 0) return { ok: false, reason: 'not-found' };
    events[idx] = { name: ev.name, start: ev.start, end: ev.end, countsAsStudy: ev.countsAsStudy };
    commitMove(dateKey, before, input, ev.name);
    return { ok: true, scope: 'day' };
  }
  const before = blocksForDay(dateKey);
  if (!relocateSingle(dateKey, block.time, input.toDateKey, ev)) return { ok: false, reason: 'not-found' };
  commitMove(dateKey, before, input, ev.name);
  return { ok: true, scope: 'day' };
}

/**
 * Igual ao commit das outras mutações, com uma diferença: se o plano do dia não
 * mudou de tamanho (mover a refeição meia hora, por exemplo), o usuário ainda
 * merece saber que o arrasto pegou — daí a frase de reserva.
 */
function commitMove(dateKey: DateKey, before: StudyBlock[], input: EventMoveInput, name: string): void {
  clearBlockCache();
  scheduleSave();
  notify();
  const delta = describePlanDelta(planDelta(before, blocksForDay(dateKey)));
  const sameDay = input.toDateKey === dateKey;
  if (sameDay && delta) showToast(delta);
  else showToast(strings.events.moved(name, input.start, sameDay ? null : dateFromKey(input.toDateKey)));
}
