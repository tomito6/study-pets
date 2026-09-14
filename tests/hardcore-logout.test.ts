// Sair da conta com um estudo hardcore ARMADO (src/application/session.ts). Era a saída
// grátis do hardcore: `resetToLoggedOut` apagava a sessão do dispositivo sem cobrar, e o
// boot seguinte não encontrava nada — enquanto fechar o app cobrava o abandono. Agora o
// "Sair" explícito cobra ANTES de sair (depois do signOut não há credencial pra salvar), e
// o logout implícito (token revogado, outra aba) deixa a sessão no dispositivo pro próximo
// boot cobrar. Item 9 da revisão de 2026-09-14 — achado pela sessão study-pets-f7.
// Sem DOM: toast, Wake Lock e localStorage caem nos fallbacks em memória.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startHardcore } from '../src/application/hardcore';
import { detachHardcoreSession, endHardcoreSession } from '../src/application/hardcoreRuntime';
import { blocksForDay, computeStatsNow, rebuildWeeks } from '../src/application/plan';
import { signOut } from '../src/application/session';
import { stopTimer } from '../src/application/timer';
import { emptyPersistedState } from '../src/domain/persistence';
import { petLevelStart } from '../src/domain/pets';
import type { PetInstance, StudyBlock } from '../src/domain/types';
import { readHardcoreSession, useHardcoreStorage } from '../src/infrastructure/hardcoreSession';
import { unloadGuardArmed } from '../src/infrastructure/unloadGuard';
import { derived, state } from '../src/store/store';

const HOJE = '2026-09-02';
const ONTEM = '2026-09-01';
const AGORA = new Date('2026-09-02T10:10:00');
const estudo3: StudyBlock = { time: '10:00', endTime: '10:25', name: '📖 Estudo 3', type: 'estudo', xp: 50, cycle: 0 };
const pausa: StudyBlock = { time: '10:25', endTime: '10:30', name: '🧘 Pausa', type: 'pausa', xp: 5, cycle: 0 };
const gato = (xp: number): PetInstance => ({ id: 'cat', species: 'cat', name: 'Mia', xp, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: 0 });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  useHardcoreStorage(null);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  state.config.hardcore = { enabled: true };
  state.pets.owned = [gato(petLevelStart(5))];
  state.pets.active = 'cat';
  state.pets.xpProcessedUntil = ONTEM;
  // Ontem fechado com 7 estudos: 350 XP consolidados — há o que cobrar.
  const blocos = blocksForDay(ONTEM).filter((b) => b.type === 'estudo').slice(0, 7);
  state.checks[ONTEM] = Object.fromEntries(blocos.map((b) => [b.time, { pet: 'cat', bonus: 0 }]));
  derived.timerBlock = null;
  derived.focusOpen = false;
  derived.timerCompleted = null;
  derived.hardcore = null;
  rebuildWeeks(AGORA);
});
afterEach(() => {
  endHardcoreSession();
  stopTimer();
  vi.useRealTimers();
});

describe('"Sair" com um estudo hardcore armado', () => {
  it('cobra o abandono antes de sair: a penalidade fica gravada, o pet perde XP, a sessão some do dispositivo', async () => {
    expect(startHardcore(estudo3, AGORA)).toEqual({ ok: true });
    expect(derived.hardcore?.armed).toBe(true);
    const xpAntes = computeStatsNow(AGORA).totalXP;
    const petAntes = state.pets.owned[0]!.xp;

    await signOut(new Date('2026-09-02T10:15:00'));

    expect(state.penalties[HOJE]).toHaveLength(1);
    expect(state.penalties[HOJE]![0]).toMatchObject({ time: '10:00', reason: 'abandon', xp: 100, petXp: 100 });
    expect(computeStatsNow(AGORA).totalXP).toBe(xpAntes - 100);
    expect(state.pets.owned[0]!.xp).toBe(petAntes - 100);
    expect(derived.hardcore).toBeNull();
    expect(readHardcoreSession('u')).toBeNull();
    expect(unloadGuardArmed()).toBe(false);
  });

  it('numa pausa (ou em espera) sai de graça, como sempre', async () => {
    expect(startHardcore(pausa, new Date('2026-09-02T10:26:00'))).toEqual({ ok: true });
    await signOut(new Date('2026-09-02T10:27:00'));
    expect(state.penalties).toEqual({});
    expect(readHardcoreSession('u')).toBeNull();
  });
});

describe('o logout implícito (token revogado, outra aba)', () => {
  it('deixa a sessão no dispositivo pro próximo boot cobrar, e só solta o runtime', () => {
    expect(startHardcore(estudo3, AGORA)).toEqual({ ok: true });
    detachHardcoreSession();
    expect(derived.hardcore).toBeNull();
    expect(unloadGuardArmed()).toBe(false);
    expect(readHardcoreSession('u')).toMatchObject({ dateKey: HOJE, time: '10:00' }); // o boot seguinte encontra e cobra
  });
});
