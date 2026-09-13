// O modo AO VIVO (src/application/live.ts): o dia começa quando a pessoa aperta Começar,
// e um pomodoro emenda no outro. Nada é montado antes.
// Sem DOM: toast, Wake Lock e localStorage caem nos fallbacks em memória.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDayMode } from '../src/application/dayWindows';
import { chainLive, startLive } from '../src/application/live';
import { blocksForDay, clearBlockCache, dayModeOf, rebuildWeeks } from '../src/application/plan';
import { reconcileTimer, startTimer, stopTimer } from '../src/application/timer';
import { isChecked } from '../src/domain/checks';
import { emptyPersistedState } from '../src/domain/persistence';
import { derived, state } from '../src/store/store';

const HOJE = '2026-09-02';
const em = (hms: string) => new Date(`${HOJE}T${hms}`);
const AGORA = em('09:12:00');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.timerBlock = null;
  derived.timerPausedAt = null;
  derived.timerEndsAt = null;
  derived.focusOpen = false;
  derived.timerCompleted = null;
  derived.hardcore = null;
  clearBlockCache();
  rebuildWeeks(AGORA);
});
afterEach(() => {
  stopTimer();
  vi.useRealTimers();
});

describe('o dia ao vivo antes de começar', () => {
  it('não tem plano nenhum — é o ponto do modo', () => {
    expect(blocksForDay(HOJE).length).toBeGreaterThan(0); // rotina: o dia vem montado
    setDayMode(HOJE, 'live', AGORA);
    expect(dayModeOf(HOJE)).toBe('live');
    expect(blocksForDay(HOJE)).toEqual([]);
  });

  it('e NÃO é dia livre: a lista vazia aqui não pode virar folga', () => {
    setDayMode(HOJE, 'live', AGORA);
    // `windowOverrides` vazio seria lido como `isDayOff`; o modo mora noutro lugar.
    expect(state.windowOverrides[HOJE]).toBeUndefined();
    expect(state.dayModes[HOJE]).toBe('live');
  });
});

describe('startLive — "▶ Começar"', () => {
  it('abre a corrida agora e o primeiro bloco é um pomodoro', () => {
    setDayMode(HOJE, 'live', AGORA);
    const r = startLive(HOJE, AGORA);
    expect(r.ok && r.block).toMatchObject({ time: '09:12', endTime: '09:37', type: 'estudo', xp: 50 });
    // a janela vai só até o fim do primeiro bloco: o que vem depois não aconteceu
    expect(state.windowOverrides[HOJE]!.studyWindows).toEqual([
      { start: '09:12', end: '09:37', live: { pomo: 25, shortBreak: 5, longBreak: 20 } },
    ]);
    expect(blocksForDay(HOJE)).toHaveLength(1);
  });

  it('num dia de rotina não existe', () => {
    expect(startLive(HOJE, AGORA)).toEqual({ ok: false, reason: 'not-live' });
  });

  it('com um bloco já rodando, recusa — quem põe no timer é quem chamou', () => {
    setDayMode(HOJE, 'live', AGORA);
    const r = startLive(HOJE, AGORA);
    if (!r.ok) throw new Error('não começou');
    startTimer(r.block, AGORA);
    expect(startLive(HOJE, em('09:15:00'))).toEqual({ ok: false, reason: 'busy' });
  });
});

describe('chainLive — a emenda gera o bloco seguinte', () => {
  it('o pomodoro acaba e a corrida cresce pela pausa', () => {
    setDayMode(HOJE, 'live', AGORA);
    const r = startLive(HOJE, AGORA);
    expect(r.ok).toBe(true);
    const seguinte = chainLive(HOJE, '09:37', em('09:37:00'));
    expect(seguinte).toMatchObject({ time: '09:37', endTime: '09:42', type: 'pausa' });
    expect(blocksForDay(HOJE)).toHaveLength(2);
  });

  it('a janela nunca fica com bloco que não começou', () => {
    setDayMode(HOJE, 'live', AGORA);
    startLive(HOJE, AGORA);
    chainLive(HOJE, '09:37', em('09:37:00'));
    const janela = state.windowOverrides[HOJE]!.studyWindows[0]!;
    expect(janela.end).toBe('09:42'); // o fim da pausa que acabou de nascer, e nada além
  });

  it('sem nada pra onde emendar, devolve null e não estica a janela', () => {
    setDayMode(HOJE, 'live', AGORA);
    startLive(HOJE, AGORA);
    state.events[HOJE] = [{ name: 'Aula', start: '09:37', end: '11:00', countsAsStudy: false }];
    clearBlockCache();
    expect(chainLive(HOJE, '09:37', em('09:37:00'))).toBeNull();
    expect(state.windowOverrides[HOJE]!.studyWindows[0]!.end).toBe('09:37');
  });
});

describe('o timer emenda sozinho num dia ao vivo', () => {
  it('o bloco acaba, é marcado, e o seguinte entra — sem plano nenhum pra procurar', () => {
    setDayMode(HOJE, 'live', AGORA);
    const r = startLive(HOJE, AGORA);
    if (!r.ok) throw new Error('não começou');
    startTimer(r.block, AGORA);
    const fim = em('09:37:00');
    vi.setSystemTime(fim);
    reconcileTimer(fim);
    expect(isChecked(state.checks, HOJE, '09:12')).toBe(true);
    expect(derived.timerBlock).toMatchObject({ time: '09:37', type: 'pausa' });
    expect(derived.focusOpen).toBe(true);
  });
});
