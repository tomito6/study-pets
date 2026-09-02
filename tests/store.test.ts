import { describe, expect, it, vi } from 'vitest';
import { derived, getVersion, markAuthReady, notify, publishTimerBlock, setDay, setTab, setView, state, subscribe } from '../src/store/store';

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

  it('setView/setDay mudam semana e dia visíveis', () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    setView(3, 4);
    expect([state.uiWeek, state.uiDay]).toEqual([3, 4]);
    setDay(1);
    expect([state.uiWeek, state.uiDay]).toEqual([3, 1]);
    setDay(1);
    expect(cb).toHaveBeenCalledTimes(2);
    setView(1, 0);
    off();
  });

  it('publishTimerBlock guarda o bloco sem notificar (o legado notifica no render)', () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    publishTimerBlock({ time: '09:00', endTime: '09:25', name: 'x', type: 'estudo', xp: 50 });
    expect(derived.timerBlock?.time).toBe('09:00');
    expect(cb).not.toHaveBeenCalled();
    publishTimerBlock(null);
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
