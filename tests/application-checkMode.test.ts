// O "check só pelo foco" — versão de teste (src/application/checkMode.ts, PENDENCIAS 6).
// Com o interruptor ligado, estudo e pausa não se marcam nem se desmarcam à mão; quem
// marca é o relógio do app (o fim do bloco, com o foco aberto ou fechado) e o "Parar por
// aqui". O evento que conta como estudo continua com o check à mão — o timer não o roda.
// Desligado (o padrão), nada muda. A preferência é DESTE dispositivo.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/infrastructure/audio/sounds', () => ({ playSound: vi.fn(), primeAudio: vi.fn() }));
vi.mock('../src/shared/toast', () => ({ showToast: vi.fn() }));

import { checkOnlyByTimer, focusOnlyCheck, initCheckMode, setFocusOnlyCheck } from '../src/application/checkMode';
import { checkBlock, toggleBlockCheck } from '../src/application/checks';
import { initialDayEnd, resetEndOfDayPrompt } from '../src/application/dayEnd';
import { pauseTimer, resumeTimer } from '../src/application/pause';
import { blocksForDay, clearBlockCache, rebuildWeeks } from '../src/application/plan';
import { closeFocus, startTimer, stopTimer } from '../src/application/timer';
import { isChecked } from '../src/domain/checks';
import { emptyPersistedState } from '../src/domain/persistence';
import type { StudyEvent } from '../src/domain/types';
import { clearCheckModePref, normalizeCheckMode, readCheckModePref } from '../src/infrastructure/checkModePrefs';
import { useHardcoreStorage } from '../src/infrastructure/hardcoreSession';
import { usePauseStorage } from '../src/infrastructure/pauseSession';
import { showToast } from '../src/shared/toast';
import { derived, state } from '../src/store/store';

const HOJE = '2026-09-02';
const em = (hms: string) => new Date(`${HOJE}T${hms}`);
const AGORA = em('10:10:00');
const aula: StudyEvent = { name: 'Aula', start: '11:15', end: '12:00', countsAsStudy: true };
const reuniao: StudyEvent = { name: '👥 Reunião', start: '10:25', end: '11:00', countsAsStudy: false };

const bloco = (hora: string) => blocksForDay(HOJE).find((b) => b.time === hora)!;
const ultimoToast = (): string => {
  const calls = vi.mocked(showToast).mock.calls;
  return String(calls[calls.length - 1]?.[0] ?? '');
};

/** Põe o relógio falso em `hh:mm:ss` de hoje e deixa o watcher de 1s perceber. */
function relogioEm(hms: string): void {
  vi.setSystemTime(em(hms));
  vi.advanceTimersByTime(1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  vi.mocked(showToast).mockClear();
  usePauseStorage(null);
  useHardcoreStorage(null);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  Object.assign(derived, { timerBlock: null, timerDay: null, timerPausedAt: null, timerEndsAt: null, focusOpen: false, timerCompleted: null, hardcore: null, dayEnd: initialDayEnd(), focusOnlyCheck: false });
  clearCheckModePref();
  clearBlockCache();
  resetEndOfDayPrompt();
  rebuildWeeks(AGORA);
});

afterEach(() => {
  stopTimer();
  derived.focusOnlyCheck = false;
  clearCheckModePref();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('o interruptor é deste dispositivo, e nasce desligado', () => {
  it('sem nada gravado o teste está desligado; ligar grava e o boot seguinte lembra', () => {
    expect(initCheckMode()).toBe(false);
    setFocusOnlyCheck(true);
    expect(readCheckModePref()).toBe(true);
    derived.focusOnlyCheck = false; // outra carga da página
    expect(initCheckMode()).toBe(true);
    expect(focusOnlyCheck()).toBe(true);
    setFocusOnlyCheck(false);
    expect(readCheckModePref()).toBe(false);
  });

  it('`?check=foco` liga e fica gravado; `?check=manual` desliga; outro valor não decide nada', () => {
    vi.stubGlobal('location', { search: '?check=foco' });
    expect(initCheckMode()).toBe(true);
    vi.stubGlobal('location', { search: '' });
    expect(initCheckMode()).toBe(true); // ficou gravado
    vi.stubGlobal('location', { search: '?check=qualquer' });
    expect(initCheckMode()).toBe(true);
    vi.stubGlobal('location', { search: '?tema=loft&check=manual' });
    expect(initCheckMode()).toBe(false);
    expect(readCheckModePref()).toBe(false);
  });

  it('lixo gravado vira "nada gravado"', () => {
    for (const v of [null, 'sim', 1, {}, { focusOnly: 'true' }, []]) expect(normalizeCheckMode(v)).toBeNull();
    expect(normalizeCheckMode({ focusOnly: true })).toBe(true);
    expect(normalizeCheckMode({ focusOnly: false })).toBe(false);
  });
});

describe('com o teste ligado, o check à mão não existe pra estudo e pausa', () => {
  it('marcar à mão é recusado — estudo e pausa —, e nada é gravado', () => {
    setFocusOnlyCheck(true);
    expect(toggleBlockCheck(HOJE, bloco('09:00'), AGORA)).toBeNull(); // estudo
    expect(toggleBlockCheck(HOJE, bloco('09:25'), AGORA)).toBeNull(); // pausa
    expect(state.checks[HOJE]).toBeUndefined();
  });

  it('desmarcar à mão também: o que o relógio marcou fica', () => {
    checkBlock(HOJE, bloco('09:00'), AGORA);
    setFocusOnlyCheck(true);
    expect(toggleBlockCheck(HOJE, bloco('09:00'), AGORA)).toBeNull();
    expect(isChecked(state.checks, HOJE, '09:00')).toBe(true);
  });

  it('o evento que conta como estudo continua com o check à mão — o timer não roda evento', () => {
    state.events[HOJE] = [aula];
    clearBlockCache();
    setFocusOnlyCheck(true);
    const ev = bloco('11:15');
    expect(ev.type).toBe('event');
    expect(checkOnlyByTimer(ev)).toBe(false);
    vi.setSystemTime(em('11:30:00'));
    expect(toggleBlockCheck(HOJE, ev, em('11:30:00'))?.checked).toBe(true);
    expect(toggleBlockCheck(HOJE, ev, em('11:30:00'))?.checked).toBe(false);
  });

  it('desligado (o padrão), o check à mão é o de sempre', () => {
    expect(checkOnlyByTimer(bloco('09:00'))).toBe(false);
    expect(toggleBlockCheck(HOJE, bloco('09:00'), AGORA)?.checked).toBe(true);
    expect(toggleBlockCheck(HOJE, bloco('09:00'), AGORA)?.checked).toBe(false);
  });
});

describe('quem marca é o relógio do app', () => {
  it('o fim do bloco marca — com o foco aberto', () => {
    setFocusOnlyCheck(true);
    startTimer(bloco('10:00'), AGORA);
    relogioEm('10:25:01');
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(true);
  });

  it('e com o foco fechado: sair do foco não custa o check', () => {
    setFocusOnlyCheck(true);
    startTimer(bloco('10:00'), AGORA);
    closeFocus();
    relogioEm('10:25:01');
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(true);
  });

  it('a pausa que atravessa um compromisso: os minutos vividos entram marcados, porque não há "marcar à mão"', () => {
    state.events[HOJE] = [reuniao];
    clearBlockCache();
    setFocusOnlyCheck(true);
    startTimer(bloco('10:00'), AGORA);
    expect(pauseTimer(em('10:10:00'))).toEqual({ ok: true });
    vi.setSystemTime(em('10:40:00'));
    expect(resumeTimer(em('10:40:00'))).toBe('ended');
    expect(ultimoToast()).toBe('O bloco terminou durante a pausa — Estudo 3 entrou com 10 min ✓');
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(true);
  });

  it('o timer que ficou rodando sozinho encerra sem marcar — e o aviso não manda marcar à mão', () => {
    setFocusOnlyCheck(true);
    startTimer(bloco('10:00'), AGORA);
    relogioEm('11:30:00'); // muito além do teto de ausência
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(false);
    expect(ultimoToast()).toBe('O timer ficou rodando sozinho — encerrei sem marcar.');
  });
});
