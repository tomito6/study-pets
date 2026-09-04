// Janelas de um dia (src/application/dayWindows.ts): só aquele dia muda, "começar
// agora", dia livre neutro na sequência, e o que é recusado (passado, encerrado,
// hoje com check). Sem DOM.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toggleBlockCheck } from '../src/application/checks';
import { extendDay } from '../src/application/dayEnd';
import {
  canEditDayWindows,
  clearDayWindows,
  effectiveWindows,
  isDayOffKey,
  setDayOff,
  setDayWindows,
  startNow,
} from '../src/application/dayWindows';
import { applyPendingPetXP } from '../src/application/pets';
import { blocksForDay, calcStreaksNow, clearBlockCache, computeStatsNow, rebuildWeeks } from '../src/application/plan';
import { emptyPersistedState } from '../src/domain/persistence';
import { derived, state } from '../src/store/store';

const AGORA = new Date('2026-09-02T10:07:00'); // quarta
const HOJE = '2026-09-02';
const ONTEM = '2026-09-01';
const AMANHA = '2026-09-03';
const w = (start: string, end: string) => ({ start, end });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.weeks = [];
  clearBlockCache();
  rebuildWeeks(AGORA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('setDayWindows', () => {
  it('muda só aquele dia; a rotina e os outros dias continuam iguais', () => {
    expect(setDayWindows(HOJE, [w('10:00', '12:00')], AGORA)).toEqual({ ok: true });
    const hoje = blocksForDay(HOJE);
    expect(hoje[0]).toMatchObject({ time: '10:00', type: 'estudo' });
    // O almoço (13:00) continua aparecendo como bloqueio fora da janela; os estudos param às 12:00.
    const estudos = hoje.filter((b) => b.type === 'estudo' || b.type === 'pausa');
    expect(estudos[estudos.length - 1]!.endTime <= '12:00').toBe(true);
    expect(hoje.find((b) => b.type === 'almoco')).toMatchObject({ time: '13:00' });
    expect(blocksForDay(AMANHA)[0]).toMatchObject({ time: '09:00' });
    expect(state.config.studyWindows).toEqual([w('09:00', '18:00')]);
    expect(effectiveWindows(HOJE)).toEqual([w('10:00', '12:00')]);
    expect(effectiveWindows(AMANHA)).toEqual([w('09:00', '18:00')]);
  });

  it('o almoço editado do dia continua valendo junto com as janelas do dia', () => {
    state.lunchOverrides[HOJE] = { lunch: '11:00', lunchDur: 30 };
    setDayWindows(HOJE, [w('10:00', '14:00')], AGORA);
    expect(blocksForDay(HOJE).find((b) => b.type === 'almoco')).toMatchObject({ time: '11:00', endTime: '11:30' });
  });

  it('valida: vazio, fim antes do início, sobreposição', () => {
    expect(setDayWindows(HOJE, [], AGORA)).toEqual({ ok: false, reason: 'empty' });
    expect(setDayWindows(HOJE, [w('12:00', '10:00')], AGORA)).toEqual({ ok: false, reason: 'invalid-window' });
    expect(setDayWindows(HOJE, [w('10:00', '12:00'), w('11:00', '13:00')], AGORA)).toEqual({ ok: false, reason: 'overlap' });
    expect(state.windowOverrides).toEqual({});
  });

  it('dia futuro pode (planejar é o ponto); dia passado e dia encerrado não', () => {
    expect(setDayWindows(AMANHA, [w('14:00', '18:00')], AGORA)).toEqual({ ok: true });
    expect(blocksForDay(AMANHA).find((b) => b.type === 'estudo')).toMatchObject({ time: '14:00' });
    expect(setDayWindows(ONTEM, [w('14:00', '18:00')], AGORA)).toEqual({ ok: false, reason: 'past' });
    state.closedDays[HOJE] = true;
    expect(setDayWindows(HOJE, [w('14:00', '18:00')], AGORA)).toEqual({ ok: false, reason: 'closed' });
    expect(canEditDayWindows(HOJE, AGORA)).toEqual({ ok: false, reason: 'closed' });
  });

  it('a data do override entra nas semanas mostradas', () => {
    const antes = derived.weeks.length;
    expect(setDayWindows('2027-02-10', [w('10:00', '12:00')], AGORA)).toEqual({ ok: true });
    expect(derived.weeks.length).toBeGreaterThan(antes);
    expect(derived.weeks[derived.weeks.length - 1]!.end >= new Date('2027-02-10T00:00:00')).toBe(true);
  });
});

describe('startNow — "começar agora"', () => {
  it('hoje: o primeiro bloco passa a começar no próximo múltiplo de 5 min', () => {
    expect(startNow(HOJE, AGORA)).toEqual({ ok: true, start: '10:10' });
    expect(blocksForDay(HOJE)[0]).toMatchObject({ time: '10:10', endTime: '10:35', type: 'estudo' });
    expect(state.windowOverrides[HOJE]).toEqual({ studyWindows: [w('10:10', '18:00')] });
  });

  it('só no dia de hoje; e depois do fim do dia não sobra nada', () => {
    expect(startNow(AMANHA, AGORA)).toEqual({ ok: false, reason: 'not-today' });
    const tarde = new Date('2026-09-02T18:30:00');
    vi.setSystemTime(tarde);
    expect(startNow(HOJE, tarde)).toEqual({ ok: false, reason: 'nothing-left' });
  });
});

describe('setDayOff — dia livre', () => {
  it('hoje sem check: o plano fica vazio e o dia sai das estatísticas (planejado 0)', () => {
    expect(setDayOff(HOJE, AGORA)).toEqual({ ok: true });
    expect(isDayOffKey(HOJE)).toBe(true);
    expect(blocksForDay(HOJE)).toEqual([]);
    expect(computeStatsNow(AGORA).dayStudyPlanned[HOJE]).toBeUndefined();
  });

  it('hoje com bloco marcado não vira dia livre (seria streak freeze)', () => {
    toggleBlockCheck(HOJE, blocksForDay(HOJE)[0]!, AGORA);
    expect(setDayOff(HOJE, AGORA)).toEqual({ ok: false, reason: 'has-checks' });
    expect(blocksForDay(HOJE).length).toBeGreaterThan(0);
  });

  it('dia livre é neutro na sequência, igual ao fim de semana pausado', () => {
    // Segunda e quarta com a meta batida; terça declarada livre (como se tivesse sido na véspera).
    state.windowOverrides[ONTEM] = { studyWindows: [] };
    clearBlockCache();
    const mins = { '2026-08-31': 60, [HOJE]: 60 };
    expect(calcStreaksNow(mins, AGORA)).toEqual({ cur: 2, best: 2 });
    delete state.windowOverrides[ONTEM];
    clearBlockCache();
    expect(calcStreaksNow(mins, AGORA)).toEqual({ cur: 1, best: 1 });
  });

  it('restaurar a rotina traz o plano de volta', () => {
    setDayOff(HOJE, AGORA);
    expect(clearDayWindows(HOJE, AGORA)).toEqual({ ok: true });
    expect(state.windowOverrides[HOJE]).toBeUndefined();
    expect(blocksForDay(HOJE)[0]).toMatchObject({ time: '09:00' });
    expect(clearDayWindows(HOJE, AGORA)).toEqual({ ok: true }); // sem override é no-op
  });
});

describe('quem lê as janelas do dia', () => {
  it('"Prolongar" num dia com janelas editadas estica o override, não a rotina', () => {
    setDayWindows(HOJE, [w('10:00', '12:00')], AGORA);
    extendDay('13:30', AGORA);
    expect(state.windowOverrides[HOJE]).toEqual({ studyWindows: [w('10:00', '13:30')] });
    expect(state.config.end).toBe('18:00');
    expect(state.config.studyWindows).toEqual([w('09:00', '18:00')]);
  });

  it('"Prolongar" sem override continua mudando a rotina', () => {
    extendDay('19:00', AGORA);
    expect(state.config.end).toBe('19:00');
  });

  it('o XP do pet usa os blocos do dia como eram (janelas daquele dia), senão o check não bate com nada', () => {
    state.pets.owned = [{ id: 'cat', species: 'cat', name: 'Tom', xp: 0, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: 0 }];
    state.pets.active = 'cat';
    state.pets.xpProcessedUntil = '2026-08-31';
    state.windowOverrides[ONTEM] = { studyWindows: [w('10:10', '12:00')] }; // ontem começou às 10:10
    state.checks[ONTEM] = { '10:10': { pet: 'cat', bonus: 0 } };
    clearBlockCache();
    applyPendingPetXP(AGORA);
    expect(state.pets.owned[0]!.xp).toBe(50);
  });
});
