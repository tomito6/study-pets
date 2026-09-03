// Camada de aplicação: liga domínio ao store. Testado mutando o store direto,
// como o legado faz.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blocksForDay, clearBlockCache, computeStatsNow, currentDayKey, rebuildWeeks } from '../src/application/plan';
import { toggleBlockCheck } from '../src/application/checks';
import { emptyPersistedState } from '../src/domain/persistence';
import { derived, state } from '../src/store/store';

const AGORA = new Date('2026-09-02T17:30:00');
const HOJE = '2026-09-02';

function resetStore() {
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.weeks = [];
  clearBlockCache();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  resetStore();
  rebuildWeeks(AGORA);
});

describe('rebuildWeeks / currentDayKey', () => {
  it('monta as semanas a partir do store e aponta o dia visível', () => {
    expect(derived.weeks.length).toBeGreaterThan(8);
    expect(currentDayKey()).toBe(HOJE); // semana 1, dia 2 = quarta
  });
});

describe('blocksForDay', () => {
  it('gera os blocos do dia com a config do store', () => {
    const blocks = blocksForDay(HOJE);
    expect(blocks[0]).toMatchObject({ time: '09:00', type: 'estudo' });
    expect(blocks.some((b) => b.type === 'almoco')).toBe(true);
  });

  it('respeita o almoço editado só daquele dia', () => {
    state.lunchOverrides[HOJE] = { lunch: '12:00', lunchDur: 30 };
    expect(blocksForDay(HOJE).find((b) => b.type === 'almoco')).toMatchObject({ time: '12:00', endTime: '12:30' });
    expect(blocksForDay('2026-09-03').find((b) => b.type === 'almoco')).toMatchObject({ time: '13:00' });
  });

  it('fim de semana fica vazio com skipWeekends', () => {
    state.config.skipWeekends = true;
    expect(blocksForDay('2026-09-05')).toEqual([]);
    expect(blocksForDay(HOJE).length).toBeGreaterThan(0);
  });
});

describe('toggleBlockCheck', () => {
  it('marca, devolve o ganho, e desmarca', () => {
    const b = blocksForDay(HOJE)[0]!;
    const r = toggleBlockCheck(HOJE, b, AGORA);
    expect(r).toEqual({ checked: true, xp: 50, coins: 25 });
    expect(state.checks[HOJE]?.['09:00']).toEqual({ pet: null, bonus: 0 });

    const r2 = toggleBlockCheck(HOJE, b, AGORA);
    expect(r2).toEqual({ checked: false, xp: 0, coins: 0 });
    expect(state.checks[HOJE]).toBeUndefined();
  });

  it('grava o pet equipado no momento', () => {
    state.pets.owned = [{ id: 'cat', species: 'cat', name: 'Mia', xp: 0, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: 0 }];
    state.pets.active = 'cat';
    const b = blocksForDay(HOJE)[0]!;
    toggleBlockCheck(HOJE, b, AGORA);
    expect(state.checks[HOJE]?.['09:00']).toEqual({ pet: 'cat', bonus: 0 });
  });

  it('recusa dia encerrado e dia futuro', () => {
    const b = blocksForDay(HOJE)[0]!;
    state.closedDays[HOJE] = true;
    expect(toggleBlockCheck(HOJE, b, AGORA)).toBeNull();
    expect(toggleBlockCheck('2026-09-03', blocksForDay('2026-09-03')[0]!, AGORA)).toBeNull();
  });
});

describe('computeStatsNow', () => {
  it('reflete um check de hoje como pendente, e memoiza por versão', () => {
    const antes = computeStatsNow(AGORA);
    expect(antes.todayXP).toBe(0);
    expect(computeStatsNow(AGORA)).toBe(antes); // mesma referência = memo

    toggleBlockCheck(HOJE, blocksForDay(HOJE)[0]!, AGORA); // scheduleSave → notify → versão nova
    const depois = computeStatsNow(AGORA);
    expect(depois).not.toBe(antes);
    expect(depois.todayXP).toBe(50);
    expect(depois.totalXP).toBe(0); // hoje ainda aberto
  });
});
