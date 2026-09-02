import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addEvent,
  addEventSeries,
  deleteEvent,
  deleteSeries,
  deleteSeriesOccurrence,
  lunchForDay,
  setLunchOverride,
  validateEvent,
  validateSeries,
} from '../src/application/events';
import { blocksForDay, clearBlockCache, rebuildWeeks } from '../src/application/plan';
import { emptyPersistedState } from '../src/domain/persistence';
import { derived, state } from '../src/store/store';

const AGORA = new Date('2026-09-02T17:30:00'); // quarta
const HOJE = '2026-09-02';
const PROXIMA_QUARTA = '2026-09-09';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.weeks = [];
  clearBlockCache();
  rebuildWeeks(AGORA);
});

describe('validação', () => {
  it('fim tem que ser depois do início', () => {
    expect(validateEvent({ name: 'x', start: '10:00', end: '10:00', countsAsStudy: true })).toEqual({ ok: false, reason: 'end-before-start' });
    expect(validateEvent({ name: 'x', start: '10:00', end: '10:30', countsAsStudy: true })).toEqual({ ok: true });
  });

  it('série precisa de pelo menos um dia da semana', () => {
    expect(validateSeries({ name: 'x', start: '10:00', end: '10:30', countsAsStudy: true, weekdays: [], freq: 'weekly', until: null })).toEqual({ ok: false, reason: 'no-weekdays' });
  });
});

describe('eventos avulsos', () => {
  it('entra no dia e aparece no plano; nome vazio vira "Evento"', () => {
    addEvent(HOJE, { name: '  ', start: '10:00', end: '11:30', countsAsStudy: true });
    expect(state.events[HOJE]).toEqual([{ name: 'Evento', start: '10:00', end: '11:30', countsAsStudy: true }]);
    expect(blocksForDay(HOJE).some((b) => b.type === 'event' && b.time === '10:00')).toBe(true);
  });

  it('apagar pelo horário de início limpa o dia quando fica vazio', () => {
    addEvent(HOJE, { name: 'Aula', start: '10:00', end: '11:30', countsAsStudy: true });
    deleteEvent(HOJE, '10:00');
    expect(state.events[HOJE]).toBeUndefined();
    expect(blocksForDay(HOJE).some((b) => b.type === 'event')).toBe(false);
  });
});

describe('séries', () => {
  const serie = () => addEventSeries(HOJE, { name: 'Treino', start: '18:00', end: '19:00', countsAsStudy: false, weekdays: [3], freq: 'weekly', until: null });

  it('cria com âncora no dia visível e aparece nas próximas quartas', () => {
    serie();
    expect(state.eventSeries).toHaveLength(1);
    expect(state.eventSeries[0]).toMatchObject({ name: 'Treino', anchor: HOJE, exceptions: [], countsAsStudy: false });
    expect(blocksForDay(PROXIMA_QUARTA).some((b) => b.type === 'intervalo')).toBe(true);
  });

  it('"só este dia" vira exceção e não mexe nos outros', () => {
    serie();
    deleteSeriesOccurrence(state.eventSeries[0]!.id, PROXIMA_QUARTA);
    expect(state.eventSeries[0]!.exceptions).toEqual([PROXIMA_QUARTA]);
    expect(blocksForDay(PROXIMA_QUARTA).some((b) => b.type === 'intervalo')).toBe(false);
    expect(blocksForDay('2026-09-16').some((b) => b.type === 'intervalo')).toBe(true);
  });

  it('"apagar a série" some de todos os dias', () => {
    serie();
    deleteSeries(state.eventSeries[0]!.id, HOJE);
    expect(state.eventSeries).toEqual([]);
    expect(blocksForDay(PROXIMA_QUARTA).some((b) => b.type === 'intervalo')).toBe(false);
  });
});

describe('almoço do dia', () => {
  it('sem override, mostra a config; com override, só aquele dia muda', () => {
    expect(lunchForDay(HOJE)).toEqual({ lunch: '13:00', lunchDur: 60 });
    setLunchOverride(HOJE, '12:00', 30);
    expect(lunchForDay(HOJE)).toEqual({ lunch: '12:00', lunchDur: 30 });
    expect(lunchForDay('2026-09-03')).toEqual({ lunch: '13:00', lunchDur: 60 });
    expect(blocksForDay(HOJE).find((b) => b.type === 'almoco')).toMatchObject({ time: '12:00', endTime: '12:30' });
  });
});
