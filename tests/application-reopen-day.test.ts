// Reabrir o dia (src/application/dayEnd.ts): o desfazer do "✓ Encerrar o dia".
//
// O que precisa ser provado aqui não é "o botão funciona", é que os dois caminhos
// chegam no MESMO lugar: marcar dois blocos e encerrar uma vez tem que valer o
// mesmo que marcar um, encerrar, reabrir, marcar o outro e encerrar de novo. O XP
// do usuário e as moedas são derivados dos checks e se corrigem sozinhos; o do pet
// é acumulado, e é ali que um crédito em dobro (ou nenhum) ficaria pra sempre.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toggleBlockCheck } from '../src/application/checks';
import { canReopenDay, closeDay, initialDayEnd, reopenDay, resetEndOfDayPrompt, scheduleEndOfDayPrompt } from '../src/application/dayEnd';
import { blocksForDay, clearBlockCache, computeStatsNow, rebuildWeeks } from '../src/application/plan';
import { emptyPersistedState } from '../src/domain/persistence';
import type { PetInstance, StudyBlock } from '../src/domain/types';
import { derived, state } from '../src/store/store';

const HOJE = '2026-09-02';
const ONTEM = '2026-09-01';
const mia: PetInstance = { id: 'cat', species: 'cat', name: 'Mia', xp: 0, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: 0 };

function resetAt(iso: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.weeks = [];
  derived.dayEnd = initialDayEnd();
  derived.onboardingOpen = false;
  state.pets.owned = [{ ...mia }];
  state.pets.active = 'cat';
  state.pets.xpProcessedUntil = ONTEM;
  clearBlockCache();
  resetEndOfDayPrompt();
  rebuildWeeks(new Date(iso));
}

/** Os dois primeiros estudos de hoje — 09:00 e 09:30, os dois já começados às 17:30. */
const estudos = (): StudyBlock[] => blocksForDay(HOJE).filter((b) => b.type === 'estudo');

describe('reabrir o dia', () => {
  beforeEach(() => resetAt('2026-09-02T17:30:00'));

  it('destrava os checks e devolve o XP do pet', () => {
    toggleBlockCheck(HOJE, estudos()[0]!);
    closeDay();
    expect(state.pets.owned[0]!.xp).toBe(50);
    expect(state.pets.xpProcessedUntil).toBe(HOJE);
    expect(toggleBlockCheck(HOJE, estudos()[1]!), 'dia encerrado é read-only').toBeNull();

    expect(reopenDay()).toBe(true);
    expect(state.closedDays[HOJE]).toBeUndefined();
    expect(state.pets.owned[0]!.xp, 'o crédito de hoje volta pro lugar').toBe(0);
    expect(state.pets.xpProcessedUntil, 'só este dia sai da conta').toBe(ONTEM);
    expect(toggleBlockCheck(HOJE, estudos()[1]!)).not.toBeNull();
    // O check de antes continua lá: reabrir não desmarca nada.
    expect(state.checks[HOJE]!['09:00']).toBeTruthy();
  });

  it('encerrar → reabrir → marcar mais → encerrar de novo chega no mesmo lugar que encerrar uma vez só', () => {
    const b = estudos();
    toggleBlockCheck(HOJE, b[0]!);
    closeDay();
    reopenDay();
    toggleBlockCheck(HOJE, estudos()[1]!);
    closeDay();
    const pelaVolta = { pet: state.pets.owned[0]!.xp, until: state.pets.xpProcessedUntil, xp: computeStatsNow().totalXP };

    // O mesmo dia, sem nunca ter reaberto.
    resetAt('2026-09-02T17:30:00');
    const d = estudos();
    toggleBlockCheck(HOJE, d[0]!);
    toggleBlockCheck(HOJE, d[1]!);
    closeDay();
    expect(pelaVolta).toEqual({ pet: state.pets.owned[0]!.xp, until: state.pets.xpProcessedUntil, xp: computeStatsNow().totalXP });
    expect(pelaVolta.pet, 'dois estudos de 25 min, nem em dobro nem de graça').toBe(100);
  });

  it('só em hoje, e só num dia encerrado', () => {
    expect(canReopenDay()).toBe(false); // dia aberto: não há o que desfazer
    expect(reopenDay()).toBe(false);
    // Ontem encerrado não conta: passado é escrito, e reabrir ali seria reescrever histórico.
    state.closedDays[ONTEM] = true;
    expect(canReopenDay()).toBe(false);
    expect(reopenDay()).toBe(false);
    expect(state.closedDays[ONTEM]).toBe(true);
  });

  it('tira do sininho as linhas que o crédito deste dia deixou', () => {
    toggleBlockCheck(HOJE, estudos()[0]!);
    closeDay();
    const doDia = (n: { id: string }) => n.id === `dia:${HOJE}`;
    expect(state.notifications.some(doDia), 'o fim do dia escreve a linha do dia').toBe(true);
    // Uma linha de outro dia, e o marco de horas (que fala do TOTAL): as duas ficam.
    state.notifications = [
      { id: `dia:${ONTEM}`, kind: 'dia', at: 1, read: true, data: { dia: ONTEM, xp: 10 } },
      { id: 'horas:10', kind: 'horas', at: 1, read: true, data: { n: 10 } },
      ...state.notifications,
    ];

    reopenDay();
    expect(state.notifications.some(doDia)).toBe(false);
    expect(state.notifications.map((n) => n.id)).toEqual([`dia:${ONTEM}`, 'horas:10']);
  });

  it('não abre o prompt de fim de dia no mesmo segundo', () => {
    toggleBlockCheck(HOJE, estudos()[0]!);
    closeDay();
    vi.setSystemTime(new Date('2026-09-02T18:05:00')); // depois do último estudo
    reopenDay();
    scheduleEndOfDayPrompt();
    expect(derived.dayEnd.promptOpen, 'quem acabou de reabrir não quer o "encerrar?" de volta').toBe(false);
  });
});
