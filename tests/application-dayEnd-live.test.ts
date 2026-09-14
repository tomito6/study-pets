// O prompt de fim de dia e o modo ao vivo (src/application/dayEnd.ts). Num dia ao vivo o
// "último estudo do plano" é sempre o bloco que acabou de acontecer, então qualquer
// reagendamento disparava o prompt no meio do dia; e o "Prolongar" esticava a corrida,
// inventando um plano. E num dia de ROTINA, "■ Parar por aqui" reagendava pelo parcial
// recém-cortado — o prompt abria no mesmo segundo, oferecendo o "Encerrar" que a folha
// acabou de oferecer. Item 5 da revisão de 2026-09-14.
// Sem DOM: toast, Wake Lock e localStorage caem nos fallbacks em memória.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toggleBlockCheck } from '../src/application/checks';
import { extendDay, initialDayEnd, resetEndOfDayPrompt, scheduleEndOfDayPrompt } from '../src/application/dayEnd';
import { clearDayWindows, setDayMode } from '../src/application/dayWindows';
import { startLive } from '../src/application/live';
import { pauseTimer, resumeTimer, stopHere } from '../src/application/pause';
import { blocksForDay, clearBlockCache, rebuildWeeks } from '../src/application/plan';
import { startTimer, stopTimer } from '../src/application/timer';
import { emptyPersistedState } from '../src/domain/persistence';
import type { StudyBlock } from '../src/domain/types';
import { useHardcoreStorage } from '../src/infrastructure/hardcoreSession';
import { usePauseStorage } from '../src/infrastructure/pauseSession';
import { derived, state } from '../src/store/store';

const HOJE = '2026-09-02';
const em = (hms: string) => new Date(`${HOJE}T${hms}`);
const estudo3: StudyBlock = { time: '10:00', endTime: '10:25', name: '📖 Estudo 3', type: 'estudo', xp: 50, cycle: 0 };
function relogioEm(hms: string): void {
  vi.setSystemTime(em(hms));
  vi.advanceTimersByTime(1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(em('09:12:00'));
  usePauseStorage(null);
  useHardcoreStorage(null);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.timerBlock = null;
  derived.timerDay = null;
  derived.timerPausedAt = null;
  derived.timerEndsAt = null;
  derived.focusOpen = false;
  derived.timerCompleted = null;
  derived.hardcore = null;
  derived.dayEnd = initialDayEnd();
  clearBlockCache();
  resetEndOfDayPrompt();
  rebuildWeeks(em('09:12:00'));
});
afterEach(() => {
  stopTimer();
  vi.useRealTimers();
});

describe('num dia ao vivo', () => {
  it('o prompt não abre no fim de um bloco da corrida, mesmo depois de uma pausa', () => {
    setDayMode(HOJE, 'live', em('09:12:00'));
    const r = startLive(HOJE, em('09:12:00'));
    if (!r.ok) throw new Error('não começou');
    startTimer(r.block, em('09:12:00'));
    relogioEm('09:37:00'); // estudo 1 ✓ (há check hoje: a única outra condição do prompt)
    relogioEm('09:42:00'); // estudo 2 rodando
    vi.setSystemTime(em('09:45:00'));
    pauseTimer(em('09:45:00'));
    vi.setSystemTime(em('09:46:00'));
    expect(resumeTimer(em('09:46:00'))).toBe('resumed'); // reagenda — e num dia ao vivo isso era o gatilho
    relogioEm('10:08:00'); // o fim do estudo 2 (09:42 + 25 + 1 de pausa)
    relogioEm('10:09:00');
    expect(derived.dayEnd.promptOpen).toBe(false);
    expect(derived.timerBlock).toMatchObject({ type: 'pausa' }); // e a corrida continua
  });

  it('nem por um agendamento direto', () => {
    setDayMode(HOJE, 'live', em('09:12:00'));
    const r = startLive(HOJE, em('09:12:00'));
    if (!r.ok) throw new Error('não começou');
    startTimer(r.block, em('09:12:00'));
    relogioEm('09:37:00');
    stopTimer();
    scheduleEndOfDayPrompt(em('09:40:00')); // o último estudo (09:37) já passou e há check
    vi.advanceTimersByTime(60_000);
    expect(derived.dayEnd.promptOpen).toBe(false);
  });

  it('"Prolongar" não inventa blocos futuros dentro da corrida', () => {
    setDayMode(HOJE, 'live', em('09:12:00'));
    const r = startLive(HOJE, em('09:12:00'));
    if (!r.ok) throw new Error('não começou');
    startTimer(r.block, em('09:12:00'));
    relogioEm('09:37:00');
    stopTimer();
    extendDay('15:00', em('09:40:00'));
    expect(blocksForDay(HOJE).filter((b) => b.type === 'estudo' && b.time > '09:40')).toHaveLength(0);
    expect(state.windowOverrides[HOJE]!.studyWindows[0]!.end).toBe('09:42');
  });
});

describe('num dia de rotina, "■ Parar por aqui"', () => {
  it('não abre o prompt no mesmo segundo — e "Voltar ao padrão" volta a armá-lo', () => {
    vi.setSystemTime(em('09:30:00'));
    toggleBlockCheck(HOJE, blocksForDay(HOJE).find((b) => b.time === '09:00')!, em('09:30:00'));
    vi.setSystemTime(em('10:10:00'));
    startTimer(estudo3, em('10:10:00'));
    vi.setSystemTime(em('10:12:00'));
    expect(stopHere(em('10:12:00')).ok).toBe(true);
    vi.advanceTimersByTime(5_000);
    expect(derived.dayEnd.promptOpen).toBe(false);

    // A rotina volta de agora em diante: o último estudo passa a ser o das 17:xx, e o
    // prompt é agendado pra ele, como sempre.
    vi.setSystemTime(em('10:20:00'));
    expect(clearDayWindows(HOJE, em('10:20:00')).ok).toBe(true);
    expect(derived.dayEnd.promptOpen).toBe(false);
    // O relógio anda COM os timers (`advanceTimersByTime`, sem `setSystemTime`): o
    // `setSystemTime` desloca os timers junto, e o prompt cairia no dia seguinte.
    expect(blocksForDay(HOJE).filter((b) => b.type === 'estudo').pop()!.endTime).toBe('18:00');
    vi.advanceTimersByTime(8 * 60 * 60 * 1000);
    expect(derived.dayEnd.promptOpen).toBe(true);
    expect(derived.dayEnd.promptLastEnd).toBe('18:00');
  });
});
