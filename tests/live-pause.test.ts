// As duas primeiras correções da revisão de 2026-09-14 (relatório da sessão de revisão,
// itens 1 e 3). Os dois testes abaixo REPROVAM no código de antes delas — eles nasceram
// como hipóteses, escritos por quem revisou, e viraram rede depois de confirmados.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDay, initialDayEnd, resetEndOfDayPrompt } from '../src/application/dayEnd';
import { setDayMode } from '../src/application/dayWindows';
import { startLive } from '../src/application/live';
import { pauseTimer, resumeTimer, stopHere } from '../src/application/pause';
import { blocksForDay, clearBlockCache, rebuildWeeks } from '../src/application/plan';
import { startTimer, stopTimer } from '../src/application/timer';
import { isChecked } from '../src/domain/checks';
import { emptyPersistedState } from '../src/domain/persistence';
import { blockMins } from '../src/domain/time';
import type { StudyBlock } from '../src/domain/types';
import { useHardcoreStorage } from '../src/infrastructure/hardcoreSession';
import { usePauseStorage } from '../src/infrastructure/pauseSession';
import { derived, state } from '../src/store/store';

vi.mock('../src/shared/toast', () => ({ showToast: () => {} }));

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
  Object.assign(derived, { timerBlock: null, timerDay: null, timerPausedAt: null, timerEndsAt: null, focusOpen: false, timerCompleted: null, hardcore: null, dayEnd: initialDayEnd() });
  clearBlockCache();
  resetEndOfDayPrompt();
  rebuildWeeks(em('09:12:00'));
});

afterEach(() => {
  stopTimer();
  vi.useRealTimers();
});

describe('"■ Parar por aqui" credita os minutos que passaram', () => {
  it('o bloco parcial sai MARCADO — a folha promete o XP, e prometer sem creditar é mentir', () => {
    startTimer(estudo3, em('10:10:00'));
    vi.setSystemTime(em('10:12:00'));
    const r = stopHere(em('10:12:00'));
    expect(r.ok).toBe(true);
    // O corte já funcionava: o bloco encolhe pros 12 min vividos. O que faltava era o check.
    const parcial = blocksForDay(HOJE).find((b) => b.time === '10:00')!;
    expect(blockMins(parcial)).toBe(12);
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(true);
  });

  it('e o dia fecha com esse XP — antes o resumo dizia zero', () => {
    startTimer(estudo3, em('10:10:00'));
    vi.setSystemTime(em('10:12:00'));
    stopHere(em('10:12:00'));
    expect(closeDay(em('10:12:00')).userXP).toBe(24); // 12 min × 2
  });
});

describe('pausar dentro de uma corrida do modo ao vivo', () => {
  /** A corrida do primeiro pomodoro: 09:12–09:37, ritmo padrão. */
  function corridaComecada(): StudyBlock {
    setDayMode(HOJE, 'live', em('09:12:00'));
    const r = startLive(HOJE, em('09:12:00'));
    if (!r.ok) throw new Error('a corrida não começou');
    startTimer(r.block, em('09:12:00'));
    return r.block;
  }

  // O caso que a revisão achou DEPOIS do primeiro conserto: medir o crescimento pelo bloco
  // regenerado subestima quando a pausa atravessa o fim da corrida, porque o gerador conta
  // os minutos pausados só até o corte. Os dois cenários abaixo reprovavam assim.
  it('a pausa que atravessa o fim da corrida cresce ela o tanto certo', () => {
    corridaComecada();
    vi.setSystemTime(em('09:33:00'));
    expect(pauseTimer(em('09:33:00'))).toEqual({ ok: true });
    vi.setSystemTime(em('09:39:00'));
    expect(resumeTimer(em('09:39:00'))).toBe('resumed');
    const bloco = blocksForDay(HOJE).find((b) => b.time === '09:12')!;
    expect(blockMins(bloco)).toBe(25); // e não 23, com a pausa contada pela metade
    expect(bloco.endTime).toBe('09:43');
  });

  it('e a pausa LONGA que começa no último minuto não mata o bloco', () => {
    corridaComecada();
    vi.setSystemTime(em('09:36:00'));
    expect(pauseTimer(em('09:36:00'))).toEqual({ ok: true });
    vi.setSystemTime(em('09:46:00'));
    // Antes isto devolvia 'ended': a janela crescia 1 min, o relógio batia no fim do plano
    // e o bloco era dado como terminado — 24 min de estudo sem crédito nenhum.
    expect(resumeTimer(em('09:46:00'))).toBe('resumed');
    const bloco = blocksForDay(HOJE).find((b) => b.time === '09:12')!;
    expect(blockMins(bloco)).toBe(25);
    expect(bloco.endTime).toBe('09:47');
  });

  it('o bloco continua valendo os 25 min, e a emenda continua', () => {
    corridaComecada();
    vi.setSystemTime(em('09:20:00'));
    expect(pauseTimer(em('09:20:00'))).toEqual({ ok: true });
    vi.setSystemTime(em('09:27:00'));
    expect(resumeTimer(em('09:27:00'))).toBe('resumed');

    // A janela da corrida ia só até 09:37 (o fim do primeiro pomodoro): sem crescer com a
    // pausa, o bloco era CORTADO ali e valia 18 min em vez de 25 — XP que a pessoa estudou.
    const bloco = blocksForDay(HOJE).find((b) => b.time === '09:12')!;
    expect(blockMins(bloco)).toBe(25);
    expect(bloco.paused).toBe(7);

    // E no fim dele a corrente segue: o bloco é marcado sozinho e o foco emenda na pausa.
    // Antes `chainLive` procurava a janela pelo fim EXATO e não achava nenhuma, então o
    // timer morria no meio do dia.
    relogioEm('09:44:00');
    relogioEm('09:44:01');
    expect(isChecked(state.checks, HOJE, '09:12')).toBe(true);
    expect(derived.timerBlock).toMatchObject({ type: 'pausa' });
  });
});
