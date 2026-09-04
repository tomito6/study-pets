// Sync entre dispositivos (src/application/sync.ts): o que entra no estado quando um
// documento chega do servidor, e o que é descartado — eco, repetição, onboarding
// aberto, save local pendente. Chamado direto com docs falsos; sem rede.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_ID, cancelPendingSave, scheduleSave } from '../src/application/save';
import { applyRemoteDoc, rememberDoc } from '../src/application/sync';
import { emptyPersistedState, serializeState } from '../src/domain/persistence';
import type { PersistedState } from '../src/domain/persistence';
import type { StudyBlock } from '../src/domain/types';
import { derived, state } from '../src/store/store';

const AGORA = new Date('2026-09-02T17:30:00');
const HOJE = '2026-09-02';
const OUTRO = { writer: 'outro-dispositivo', writtenAt: 1_000 };

const docRemoto = (patch: Partial<PersistedState>, meta: { writer: string; writtenAt: number } | null = OUTRO) => ({
  ...serializeState({ ...emptyPersistedState(), ...patch }),
  ...(meta ? { meta } : {}),
});

const checksRemotos = { [HOJE]: { '09:00': { pet: null, bonus: 0 } } };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.weeks = [];
  derived.onboardingOpen = false;
  derived.timerBlock = null;
  derived.focusOpen = false;
  cancelPendingSave();
  rememberDoc(null);
});

afterEach(() => {
  cancelPendingSave();
  vi.useRealTimers();
});

describe('applyRemoteDoc', () => {
  it('aplica os checks vindos de outro dispositivo e remonta as semanas', () => {
    expect(applyRemoteDoc(docRemoto({ checks: checksRemotos, coinsSpent: 150 }), AGORA)).toBe('applied');
    expect(state.checks).toEqual(checksRemotos);
    expect(state.coinsSpent).toBe(150);
    expect(derived.weeks.length).toBeGreaterThan(0);
  });

  it('ignora o eco da própria escrita (meta.writer = este CLIENT_ID)', () => {
    const r = applyRemoteDoc(docRemoto({ checks: checksRemotos }, { writer: CLIENT_ID, writtenAt: 5 }), AGORA);
    expect(r).toBe('echo');
    expect(state.checks).toEqual({});
  });

  it('a mesma emissão de novo (mesmo writtenAt) não é aplicada duas vezes', () => {
    const doc = docRemoto({ checks: checksRemotos });
    expect(applyRemoteDoc(doc, AGORA)).toBe('applied');
    expect(applyRemoteDoc(doc, AGORA)).toBe('same');
    // Um doc mais novo do mesmo dispositivo entra normalmente.
    expect(applyRemoteDoc(docRemoto({ checks: {} }, { writer: 'outro-dispositivo', writtenAt: 2_000 }), AGORA)).toBe('applied');
    expect(state.checks).toEqual({});
  });

  it('o doc que acabou de ser carregado no login (rememberDoc) é reconhecido na primeira emissão', () => {
    const carregado = docRemoto({ checks: checksRemotos });
    rememberDoc(carregado);
    expect(applyRemoteDoc(carregado, AGORA)).toBe('same');
  });

  it('doc antigo sem carimbo: aplica uma vez, e a repetição idêntica é ignorada pelo conteúdo', () => {
    const semMeta = docRemoto({ checks: checksRemotos }, null);
    expect(applyRemoteDoc(semMeta, AGORA)).toBe('applied');
    expect(applyRemoteDoc(semMeta, AGORA)).toBe('same');
  });

  it('não entra por cima do onboarding aberto (conta nova em duas abas)', () => {
    derived.onboardingOpen = true;
    expect(applyRemoteDoc(docRemoto({ checks: checksRemotos }), AGORA)).toBe('onboarding');
    expect(state.checks).toEqual({});
  });

  it('com save local pendente, o local vence; depois que o save sai, o remoto seguinte entra', async () => {
    scheduleSave();
    expect(applyRemoteDoc(docRemoto({ checks: checksRemotos }), AGORA)).toBe('pending-save');
    expect(state.checks).toEqual({});
    await vi.advanceTimersByTimeAsync(1_000); // o debounce dispara e o save (em memória) resolve
    expect(applyRemoteDoc(docRemoto({ checks: checksRemotos }, { writer: 'outro-dispositivo', writtenAt: 3_000 }), AGORA)).toBe('applied');
    expect(state.checks).toEqual(checksRemotos);
  });

  it('nunca mexe no timer nem no foco desta aba', () => {
    const bloco: StudyBlock = { time: '17:15', endTime: '17:40', name: '📖 Estudo', type: 'estudo', xp: 50, session: 3 };
    derived.timerBlock = bloco;
    derived.focusOpen = true;
    applyRemoteDoc(docRemoto({ checks: checksRemotos }), AGORA);
    expect(derived.timerBlock).toBe(bloco);
    expect(derived.focusOpen).toBe(true);
  });

  it('sem usuário logado, ou com lixo, não faz nada', () => {
    expect(applyRemoteDoc('x', AGORA)).toBe('invalid');
    expect(applyRemoteDoc(null, AGORA)).toBe('invalid');
    state.user = null;
    expect(applyRemoteDoc(docRemoto({ checks: checksRemotos }), AGORA)).toBe('no-user');
  });
});
