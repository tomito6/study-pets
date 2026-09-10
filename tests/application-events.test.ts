import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addEvent,
  addEventSeries,
  deleteEvent,
  deleteSeries,
  deleteSeriesOccurrence,
  findEventEditTarget,
  isMovableBlock,
  moveEvent,
  moveNeedsScope,
  updateEvent,
  updateSeries,
  updateSeriesOccurrence,
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

describe('updateSeriesOccurrence — editar só este dia', () => {
  const serie = () => addEventSeries(HOJE, { name: 'Treino', start: '18:00', end: '19:00', countsAsStudy: false, weekdays: [3], freq: 'weekly', until: null });

  it('o dia vira exceção e ganha um avulso com os valores novos; a série segue igual nas outras quartas', () => {
    serie();
    const id = state.eventSeries[0]!.id;
    expect(updateSeriesOccurrence(id, HOJE, { name: 'Treino cedo', start: '07:00', end: '08:00', countsAsStudy: false })).toEqual({ ok: true });
    expect(state.eventSeries[0]!.exceptions).toEqual([HOJE]);
    expect(state.eventSeries[0]).toMatchObject({ name: 'Treino', start: '18:00' });
    expect(state.events[HOJE]).toEqual([{ name: 'Treino cedo', start: '07:00', end: '08:00', countsAsStudy: false }]);
    const hoje = blocksForDay(HOJE);
    expect(hoje.find((b) => b.type === 'intervalo')).toMatchObject({ time: '07:00', name: 'Treino cedo' });
    expect(hoje.some((b) => b._seriesId === id)).toBe(false);
    expect(blocksForDay(PROXIMA_QUARTA).find((b) => b._seriesId === id)).toMatchObject({ time: '18:00' });
  });

  it('valida antes de mexer; série que não existe é recusada', () => {
    serie();
    const id = state.eventSeries[0]!.id;
    expect(updateSeriesOccurrence(id, HOJE, { name: 'x', start: '19:00', end: '18:00', countsAsStudy: false })).toEqual({ ok: false, reason: 'end-before-start' });
    expect(state.eventSeries[0]!.exceptions).toEqual([]);
    expect(state.events[HOJE]).toBeUndefined();
    expect(updateSeriesOccurrence('nao-existe', HOJE, { name: 'x', start: '18:00', end: '19:00', countsAsStudy: false })).toEqual({ ok: false, reason: 'not-found' });
  });
});

describe('moveEvent — arrastar', () => {
  const evento = (dia = HOJE) => blocksForDay(dia).find((b) => b.type === 'event' || b.type === 'intervalo')!;

  it('avulso: muda o horário mantendo nome e "conta como estudo", e o plano acompanha', () => {
    addEvent(HOJE, { name: 'Aula', start: '14:00', end: '15:30', countsAsStudy: true });
    const r = moveEvent(HOJE, evento(), { toDateKey: HOJE, start: '10:00', end: '11:30' });
    expect(r).toEqual({ ok: true, scope: 'day' });
    expect(state.events[HOJE]).toEqual([{ name: 'Aula', start: '10:00', end: '11:30', countsAsStudy: true }]);
    expect(blocksForDay(HOJE).some((b) => b.type === 'event' && b.time === '10:00')).toBe(true);
    expect(blocksForDay(HOJE).some((b) => b.time === '14:00' && b.type === 'event')).toBe(false);
  });

  it('avulso pra outro dia: sai da lista de lá e entra na de cá', () => {
    addEvent(HOJE, { name: 'Aula', start: '14:00', end: '15:30', countsAsStudy: true });
    const r = moveEvent(HOJE, evento(), { toDateKey: PROXIMA_QUARTA, start: '09:00', end: '10:30' });
    expect(r.ok).toBe(true);
    expect(state.events[HOJE]).toBeUndefined();
    expect(state.events[PROXIMA_QUARTA]).toEqual([{ name: 'Aula', start: '09:00', end: '10:30', countsAsStudy: true }]);
  });

  it('série, "só este dia": vira exceção aqui e avulso no destino; os outros dias seguem iguais', () => {
    addEventSeries(HOJE, { name: '🍽️ Almoço', start: '13:00', end: '14:00', countsAsStudy: false, weekdays: [3], freq: 'weekly', until: null });
    const r = moveEvent(HOJE, evento(), { toDateKey: HOJE, start: '12:00', end: '13:00' }, 'day');
    expect(r).toEqual({ ok: true, scope: 'day' });
    expect(state.eventSeries![0]!.exceptions).toEqual([HOJE]);
    expect(state.eventSeries![0]!.start).toBe('13:00'); // a série não se mexeu
    expect(state.events[HOJE]).toEqual([{ name: '🍽️ Almoço', start: '12:00', end: '13:00', countsAsStudy: false }]);
    expect(blocksForDay(PROXIMA_QUARTA).some((b) => b.time === '13:00' && b.type === 'intervalo')).toBe(true);
  });

  it('série, "toda a série": muda o horário em todos os dias, sem exceção nenhuma', () => {
    addEventSeries(HOJE, { name: 'Treino', start: '18:00', end: '19:00', countsAsStudy: false, weekdays: [3], freq: 'weekly', until: null });
    const r = moveEvent(HOJE, evento(), { toDateKey: HOJE, start: '17:00', end: '18:00' }, 'series');
    expect(r).toEqual({ ok: true, scope: 'series' });
    expect(state.eventSeries![0]).toMatchObject({ start: '17:00', end: '18:00', exceptions: [] });
    expect(state.events[HOJE]).toBeUndefined();
    expect(blocksForDay(PROXIMA_QUARTA).some((b) => b.time === '17:00')).toBe(true);
  });

  it('mudar o dia da semana da série inteira é recusado — isso é edição, não arrasto', () => {
    addEventSeries(HOJE, { name: 'Treino', start: '18:00', end: '19:00', countsAsStudy: false, weekdays: [3], freq: 'weekly', until: null });
    const r = moveEvent(HOJE, evento(), { toDateKey: PROXIMA_QUARTA, start: '18:00', end: '19:00' }, 'series');
    expect(r).toEqual({ ok: false, reason: 'series-other-day' });
    expect(state.eventSeries![0]!.exceptions).toEqual([]);
  });

  it('recusa estudo/pausa, dia encerrado, horário invertido e evento que sumiu', () => {
    addEvent(HOJE, { name: 'Aula', start: '14:00', end: '15:30', countsAsStudy: true });
    const ev = evento();
    const estudo = blocksForDay(HOJE).find((b) => b.type === 'estudo')!;
    expect(moveEvent(HOJE, estudo, { toDateKey: HOJE, start: '10:00', end: '10:25' })).toEqual({ ok: false, reason: 'not-movable' });
    expect(moveEvent(HOJE, ev, { toDateKey: HOJE, start: '10:00', end: '10:00' })).toEqual({ ok: false, reason: 'end-before-start' });
    expect(moveEvent(HOJE, { ...ev, time: '07:00' }, { toDateKey: HOJE, start: '10:00', end: '11:00' })).toEqual({ ok: false, reason: 'not-found' });
    state.closedDays[HOJE] = true;
    expect(moveEvent(HOJE, ev, { toDateKey: HOJE, start: '10:00', end: '11:00' })).toEqual({ ok: false, reason: 'closed' });
    expect(state.events[HOJE]).toEqual([{ name: 'Aula', start: '14:00', end: '15:30', countsAsStudy: true }]);
  });

  it('só evento e intervalo se movem, e só série no mesmo dia pergunta o escopo', () => {
    expect(isMovableBlock({ type: 'event' })).toBe(true);
    expect(isMovableBlock({ type: 'intervalo' })).toBe(true);
    expect(isMovableBlock({ type: 'estudo' })).toBe(false);
    expect(moveNeedsScope({ _seriesId: 'ser_1' }, true)).toBe(true);
    expect(moveNeedsScope({ _seriesId: 'ser_1' }, false)).toBe(false); // outro dia: só este dia
    expect(moveNeedsScope({}, true)).toBe(false);
  });
});
