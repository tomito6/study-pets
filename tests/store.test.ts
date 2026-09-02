import { describe, expect, it, vi } from 'vitest';
import { derived, getVersion, markAuthReady, notify, publishStats, setTab, state, subscribe } from '../src/store/store';
import type { Stats } from '../src/domain/stats';

describe('store — o objeto compartilhado com o legado', () => {
  it('começa como conta nova, na aba Plano, sem usuário', () => {
    expect(state.user).toBeNull();
    expect(state.uiTab).toBe('plano');
    expect(state.checks).toEqual({});
    expect(state.config.pomo).toBe(25);
  });

  it('notify avisa os inscritos e avança a versão', () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    const v = getVersion();
    notify();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(getVersion()).toBe(v + 1);
    off();
    notify();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('setTab muda a aba e notifica; repetir a mesma aba não notifica', () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    setTab('perfil');
    expect(state.uiTab).toBe('perfil');
    expect(cb).toHaveBeenCalledTimes(1);
    setTab('perfil');
    expect(cb).toHaveBeenCalledTimes(1);
    setTab('plano');
    off();
  });

  it('publishStats guarda o derivado sem notificar (quem notifica é o renderAll)', () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    publishStats({ totalXP: 120 } as Stats);
    expect(derived.stats?.totalXP).toBe(120);
    expect(cb).not.toHaveBeenCalled();
    off();
  });

  it('markAuthReady notifica uma vez só', () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    markAuthReady();
    markAuthReady();
    expect(derived.authReady).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });
});
