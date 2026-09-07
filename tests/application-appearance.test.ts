// A escolha do tema (src/application/appearance.ts): aplica no estado, agenda o save, recusa id
// desconhecido, e sobrevive ao Salvar das Configurações e ao Cancelar sessão. Sem DOM aqui —
// a parte do <html> é da infra e vira no-op fora do browser.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentTheme, setTheme, syncThemeFromState } from '../src/application/appearance';
import { rebuildWeeks } from '../src/application/plan';
import { cancelPendingSave, hasPendingSave } from '../src/application/save';
import { cancelSession, saveSettings } from '../src/application/settings';
import { emptyPersistedState } from '../src/domain/persistence';
import { defaultDraft } from '../src/domain/settings';
import { derived, state } from '../src/store/store';

const AGORA = new Date('2026-09-02T17:30:00');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.weeks = [];
  rebuildWeeks(AGORA);
  cancelPendingSave();
});

afterEach(() => {
  cancelPendingSave();
  vi.useRealTimers();
});

describe('setTheme', () => {
  it('conta nova nasce no escuro', () => {
    expect(currentTheme()).toBe('dark');
    expect(state.config.theme).toBe('dark');
  });

  it('aplica na hora e agenda o save', () => {
    expect(setTheme('lamp')).toEqual({ ok: true });
    expect(state.config.theme).toBe('lamp');
    expect(currentTheme()).toBe('lamp');
    expect(hasPendingSave()).toBe(true);
  });

  it('recusa id desconhecido sem mudar nada', () => {
    setTheme('paper');
    cancelPendingSave();
    expect(setTheme('neon')).toEqual({ ok: false, reason: 'unknown-theme' });
    expect(state.config.theme).toBe('paper');
    expect(hasPendingSave()).toBe(false);
  });

  it('escolher o tema que já está não agenda save de novo', () => {
    setTheme('oat');
    cancelPendingSave();
    expect(setTheme('oat')).toEqual({ ok: true });
    expect(hasPendingSave()).toBe(false);
  });

  it('syncThemeFromState não quebra fora do browser', () => {
    setTheme('paper');
    expect(() => syncThemeFromState()).not.toThrow();
  });
});

describe('o tema é preferência, não configuração do dia', () => {
  it('Salvar as Configurações não mexe no tema (ele não passa pelo formulário)', () => {
    setTheme('lamp');
    expect(saveSettings({ ...defaultDraft(), pomo: '50' })).toEqual({ ok: true });
    expect(state.config.pomo).toBe(50);
    expect(state.config.theme).toBe('lamp');
  });

  it('Cancelar sessão zera a config mas mantém a aparência', () => {
    setTheme('paper');
    cancelSession();
    expect(state.config.pomo).toBe(25);
    expect(state.config.theme).toBe('paper');
  });
});
