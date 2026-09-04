import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addEvent,
  addEventSeries,
  deleteEvent,
  deleteSeries,
  deleteSeriesOccurrence,
  findEventEditTarget,
  lunchForDay,
  setLunchOverride,
  updateEvent,
  updateSeries,
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

describe('editar evento avulso', () => {
  it('substitui nome, horário e "conta como estudo" no lugar, e o plano acompanha', () => {
    addEvent(HOJE, { name: 'Aula', start: '10:00', end: '11:30', countsAsStudy: true });
    const r = updateEvent(HOJE, '10:00', { name: 'Consulta', start: '10:30', end: '11:00', countsAsStudy: false });
    expect(r).toEqual({ ok: true });
    expect(state.events[HOJE]).toEqual([{ name: 'Consulta', start: '10:30', end: '11:00', countsAsStudy: false }]);
    expect(blocksForDay(HOJE).find((b) => b.type === 'intervalo')).toMatchObject({ time: '10:30', endTime: '11:00' });
    expect(blocksForDay(HOJE).some((b) => b.type === 'event')).toBe(false);
  });

  it('valida antes de mexer, e recusa evento que não existe mais', () => {
    addEvent(HOJE, { name: 'Aula', start: '10:00', end: '11:30', countsAsStudy: true });
    expect(updateEvent(HOJE, '10:00', { name: 'x', start: '10:00', end: '09:00', countsAsStudy: true })).toEqual({ ok: false, reason: 'end-before-start' });
    expect(state.events[HOJE]![0]!.name).toBe('Aula'); // nada mudou
    expect(updateEvent(HOJE, '15:00', { name: 'x', start: '15:00', end: '16:00', countsAsStudy: true })).toEqual({ ok: false, reason: 'not-found' });
  });

  it('findEventEditTarget acha o avulso pelo início do bloco, e a série pelo _seriesId', () => {
    addEvent(HOJE, { name: 'Aula', start: '10:00', end: '11:30', countsAsStudy: true });
    addEventSeries(HOJE, { name: 'Treino', start: '18:00', end: '19:00', countsAsStudy: false, weekdays: [3], freq: 'weekly', until: null });
    const blocos = blocksForDay(HOJE);
    const aula = blocos.find((b) => b.type === 'event')!;
    const treino = blocos.find((b) => b.type === 'intervalo')!;
    expect(findEventEditTarget(HOJE, aula)).toEqual({ kind: 'single', dateKey: HOJE, event: state.events[HOJE]![0] });
    expect(findEventEditTarget(HOJE, treino)).toEqual({ kind: 'series', series: state.eventSeries[0] });
    expect(findEventEditTarget(HOJE, { time: '07:00' })).toBeNull();
  });
});

describe('editar série inteira', () => {
  const serie = () => addEventSeries(HOJE, { name: 'Treino', start: '18:00', end: '19:00', countsAsStudy: false, weekdays: [3], freq: 'weekly', until: null });

  it('troca o resto e mantém id, âncora e exceções', () => {
    serie();
    const id = state.eventSeries[0]!.id;
    deleteSeriesOccurrence(id, PROXIMA_QUARTA);
    const r = updateSeries(id, { name: 'Natação', start: '07:00', end: '08:00', countsAsStudy: true, weekdays: [3, 5], freq: 'weekly', until: '2026-12-31' }, HOJE);
    expect(r).toEqual({ ok: true });
    expect(state.eventSeries[0]).toMatchObject({ id, anchor: HOJE, exceptions: [PROXIMA_QUARTA], name: 'Natação', start: '07:00', end: '08:00', weekdays: [3, 5], until: '2026-12-31', countsAsStudy: true });
    // Sexta agora tem a série (como evento que conta), e a quarta apagada continua apagada.
    expect(blocksForDay('2026-09-04').find((b) => b.type === 'event')).toMatchObject({ time: '07:00' });
    expect(blocksForDay(PROXIMA_QUARTA).some((b) => b.type === 'event' || b.type === 'intervalo')).toBe(false);
  });

  it('valida e recusa série desconhecida', () => {
    serie();
    const id = state.eventSeries[0]!.id;
    expect(updateSeries(id, { name: 'x', start: '18:00', end: '19:00', countsAsStudy: false, weekdays: [], freq: 'weekly', until: null }, HOJE)).toEqual({ ok: false, reason: 'no-weekdays' });
    expect(state.eventSeries[0]!.name).toBe('Treino');
    expect(updateSeries('nao-existe', { name: 'x', start: '18:00', end: '19:00', countsAsStudy: false, weekdays: [3], freq: 'weekly', until: null }, HOJE)).toEqual({ ok: false, reason: 'not-found' });
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
