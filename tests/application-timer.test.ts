// Caso de uso do timer: início, fim natural, parar, foco, áudio.
// Sem DOM: Web Audio e Notification não existem em Node, e o código engole isso.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rebuildWeeks } from '../src/application/plan';
import { closeFocus, setVolume, startTimer, stopTimer, toggleMute, tryStartTimer } from '../src/application/timer';
import { emptyPersistedState } from '../src/domain/persistence';
import type { StudyBlock } from '../src/domain/types';
import { derived, state, subscribe } from '../src/store/store';

const AGORA = new Date('2026-09-02T10:10:00');
const bloco: StudyBlock = { time: '10:00', endTime: '10:25', name: '📖 Estudo 3', type: 'estudo', xp: 50, session: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), { uiWeek: 1, uiDay: 2 });
  derived.timerBlock = null;
  derived.focusOpen = false;
  derived.audio = { volume: 0.7, muted: false };
  rebuildWeeks(AGORA);
});

afterEach(() => {
  stopTimer();
  vi.useRealTimers();
});

describe('tryStartTimer', () => {
  it('inicia no bloco do momento e abre o foco', () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    expect(tryStartTimer(bloco, AGORA)).toEqual({ ok: true });
    expect(derived.timerBlock).toBe(bloco);
    expect(derived.focusOpen).toBe(true);
    expect(cb).toHaveBeenCalled();
    off();
  });

  it('recusa e não mexe no estado quando o bloco não está rolando', () => {
    const r = tryStartTimer({ ...bloco, time: '11:00', endTime: '11:25' }, AGORA);
    expect(r).toEqual({ ok: false, reason: 'not-started', minutesUntil: 50 });
    expect(derived.timerBlock).toBeNull();
    expect(derived.focusOpen).toBe(false);
  });

  it('recusa quando a aba mostra outro dia', () => {
    state.uiDay = 3; // quinta
    expect(tryStartTimer(bloco, AGORA)).toEqual({ ok: false, reason: 'not-today' });
  });
});

describe('ciclo de vida', () => {
  it('termina sozinho quando o relógio passa do fim', () => {
    startTimer(bloco);
    // Com timers falsos, avançar 1s também avança o relógio: 10:24:58 → 10:24:59.
    vi.setSystemTime(new Date('2026-09-02T10:24:58'));
    vi.advanceTimersByTime(1000);
    expect(derived.timerBlock).toBe(bloco); // 10:24:59 — ainda falta 1s

    vi.advanceTimersByTime(1000); // 10:25:00 — fim
    expect(derived.timerBlock).toBeNull();
    expect(derived.focusOpen).toBe(false);
  });

  it('parar cancela na hora', () => {
    startTimer(bloco);
    stopTimer();
    expect(derived.timerBlock).toBeNull();
    expect(derived.focusOpen).toBe(false);
    vi.advanceTimersByTime(60_000); // nenhum watcher sobrou
    expect(derived.timerBlock).toBeNull();
  });

  it('sair do foco mantém o timer rodando', () => {
    startTimer(bloco);
    closeFocus();
    expect(derived.focusOpen).toBe(false);
    expect(derived.timerBlock).toBe(bloco);
  });

  it('iniciar outro bloco substitui o anterior sem deixar watcher duplicado', () => {
    startTimer(bloco);
    const outro = { ...bloco, time: '10:05', endTime: '10:30' };
    startTimer(outro);
    expect(derived.timerBlock).toBe(outro);
    vi.setSystemTime(new Date('2026-09-02T10:26:00'));
    vi.advanceTimersByTime(1000);
    expect(derived.timerBlock).toBe(outro); // o fim do primeiro (10:25) não derruba o segundo
  });
});

describe('áudio', () => {
  it('mudo alterna; volume 0 silencia e volume > 0 reativa', () => {
    toggleMute();
    expect(derived.audio.muted).toBe(true);
    toggleMute();
    expect(derived.audio.muted).toBe(false);
    setVolume(0);
    expect(derived.audio).toEqual({ volume: 0, muted: true });
    setVolume(0.4);
    expect(derived.audio).toEqual({ volume: 0.4, muted: false });
  });
});
