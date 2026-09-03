import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAccount } from '../src/application/account';
import { rebuildWeeks } from '../src/application/plan';
import { cancelSession, saveSettings } from '../src/application/settings';
import { defaultDraft } from '../src/domain/settings';
import { SCHEMA_VERSION, emptyPersistedState } from '../src/domain/persistence';
import { auth, users } from '../src/infrastructure';
import { derived, state } from '../src/store/store';

const AGORA = new Date('2026-09-02T17:30:00');

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  state.config.periodStart = '2026-08-01';
  derived.weeks = [];
  rebuildWeeks(AGORA);
  await auth.signIn();
});

describe('saveSettings', () => {
  it('aplica o rascunho, preserva o periodStart e refaz as semanas', () => {
    const antes = derived.weeks.length;
    const r = saveSettings({ ...defaultDraft(), pomo: '50', periodEnd: '2026-09-20' });
    expect(r).toEqual({ ok: true });
    expect(state.config.pomo).toBe(50);
    expect(state.config.periodStart).toBe('2026-08-01'); // fixo por sessão
    expect(state.config.periodEnd).toBe('2026-09-20');
    expect(derived.weeks.length).toBeLessThan(antes); // periodEnd encurtou o range
  });

  it('recusa salvar com campo numérico vazio (antes gravava NaN)', () => {
    const pomoAntes = state.config.pomo;
    expect(saveSettings({ ...defaultDraft(), shortBreak: '' })).toEqual({ ok: false, reason: 'incomplete' });
    expect(state.config.pomo).toBe(pomoAntes);
  });
});

describe('cancelSession', () => {
  it('zera tudo e volta pra config padrão, mantendo o usuário', () => {
    state.checks = { '2026-09-01': { '09:00': { pet: 'cat', bonus: 0 } } };
    state.pets.owned = [{ id: 'cat', species: 'cat', name: 'Gato', xp: 0, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: 0 }];
    state.coinsSpent = 150;
    cancelSession();
    expect(state.checks).toEqual({});
    expect(state.pets).toEqual({ owned: [], active: null, activeSince: 0, xpProcessedUntil: null });
    expect(state.coinsSpent).toBe(0);
    expect(state.config.periodStart).toBeNull(); // só aqui o início é redefinido
    expect(state.user?.uid).toBe('u');
  });
});

describe('deleteAccount (infra em memória)', () => {
  it('apaga o documento e desloga', async () => {
    const uid = auth.currentUser()!.uid;
    await users.save(uid, { ...emptyPersistedState(), config: state.config, schemaVersion: SCHEMA_VERSION });
    const stages: string[] = [];
    const r = await deleteAccount((s) => stages.push(s));
    expect(r).toBe('ok');
    expect(stages).toEqual(['deleting']);
    expect(await users.load(uid)).toBeNull();
    expect(auth.currentUser()).toBeNull();
  });
});
