// Pausar e retomar (src/application/pause.ts): o relógio congela, o bloco não termina,
// ao retomar a pausa vira registro do dia e o plano desliza — o timer segue no bloco
// regenerado e emenda no seguinte no horário novo. Checks e grupos acompanham. O que
// é recusado (hardcore, em espera, dia encerrado), a pausa que atravessa o fim, a que
// ficou aberta no dispositivo (reload), a meia-noite, e "Parar" no meio da pausa.
// Sem DOM: toast, Wake Lock e localStorage caem nos fallbacks em memória.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toggleBlockCheck } from '../src/application/checks';
import { closeDay, initialDayEnd, resetEndOfDayPrompt } from '../src/application/dayEnd';
import { addGroup } from '../src/application/groups';
import { startHardcore } from '../src/application/hardcore';
import { endHardcoreSession } from '../src/application/hardcoreRuntime';
import { pauseTimer, resumePauseOnBoot, resumeTimer, timerPaused } from '../src/application/pause';
import { blocksForDay, clearBlockCache, computeStatsNow, rebuildWeeks } from '../src/application/plan';
import { closeFocus, reconcileTimer, startTimer, stopTimer } from '../src/application/timer';
import { isChecked } from '../src/domain/checks';
import { emptyPersistedState } from '../src/domain/persistence';
import { blockMins } from '../src/domain/time';
import { timerProgress } from '../src/domain/timer';
import type { StudyBlock } from '../src/domain/types';
import { useHardcoreStorage } from '../src/infrastructure/hardcoreSession';
import { readPauseSession, usePauseStorage, writePauseSession } from '../src/infrastructure/pauseSession';
import { wakeLockWanted } from '../src/infrastructure/wakeLock';
import { derived, state } from '../src/store/store';

const HOJE = '2026-09-02';
const AGORA = new Date(`${HOJE}T10:10:00`);
// Plano padrão (09:00, pomo 25 / pausa 5): Estudo 3 é 10:00–10:25, a pausa 10:25–10:30, Estudo 4 10:30–10:55.
const estudo3: StudyBlock = { time: '10:00', endTime: '10:25', name: '📖 Estudo 3', type: 'estudo', xp: 50, cycle: 0 };

const em = (hms: string) => new Date(`${HOJE}T${hms}`);

/** Relógio falso em `hh:mm:ss` de hoje, e o watcher de 1 s percebe. */
function relogioEm(hms: string): void {
  vi.setSystemTime(em(hms));
  vi.advanceTimersByTime(1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  usePauseStorage(null);
  useHardcoreStorage(null);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.timerBlock = null;
  derived.timerPausedAt = null;
  derived.timerEndsAt = null;
  derived.focusOpen = false;
  derived.timerCompleted = null;
  derived.hardcore = null;
  derived.dayEnd = initialDayEnd();
  clearBlockCache();
  resetEndOfDayPrompt();
  rebuildWeeks(AGORA);
});

afterEach(() => {
  endHardcoreSession();
  stopTimer();
  vi.useRealTimers();
});

describe('pausar', () => {
  it('congela o relógio: o restante não anda, o bloco não termina, a tela pode travar, e a pausa fica no dispositivo', () => {
    startTimer(estudo3, AGORA);
    expect(wakeLockWanted()).toBe(true);
    expect(pauseTimer(AGORA)).toEqual({ ok: true });
    expect(timerPaused()).toBe(true);
    expect(wakeLockWanted()).toBe(false);
    expect(readPauseSession('u')).toMatchObject({ dateKey: HOJE, block: { time: '10:00', endTime: '10:25' }, pausedAt: AGORA.getTime() });

    relogioEm('10:20:00');
    expect(timerProgress(derived.timerBlock!, em('10:20:00'), derived.timerPausedAt)).toMatchObject({ phase: 'paused', display: '15:00', pausedDisplay: '10:00' });
    relogioEm('10:40:00'); // passou do fim original: continua pausado, sem check, sem emenda
    expect(derived.timerBlock).toBe(estudo3);
    expect(state.checks[HOJE]).toBeUndefined();
    expect(derived.focusOpen).toBe(true);
  });

  it('recusa sem timer, em espera, no hardcore e com o dia encerrado', () => {
    expect(pauseTimer(AGORA)).toEqual({ ok: false, reason: 'no-timer' });
    startTimer({ ...estudo3, time: '10:30', endTime: '10:55', name: '📖 Estudo 4' }, AGORA);
    expect(pauseTimer(AGORA)).toEqual({ ok: false, reason: 'not-running' });
    stopTimer();
    state.config.hardcore = { enabled: true };
    startHardcore(estudo3, AGORA);
    expect(pauseTimer(AGORA)).toEqual({ ok: false, reason: 'hardcore' });
    endHardcoreSession();
    stopTimer();
    startTimer(estudo3, AGORA);
    state.closedDays = { [HOJE]: true };
    expect(pauseTimer(AGORA)).toEqual({ ok: false, reason: 'day-closed' });
  });

  it('pausar de novo é no-op; "Parar" no meio da pausa não registra nada', () => {
    startTimer(estudo3, AGORA);
    pauseTimer(AGORA);
    expect(pauseTimer(em('10:12:00'))).toEqual({ ok: true });
    expect(derived.timerPausedAt).toBe(AGORA.getTime());
    stopTimer();
    expect(derived.timerBlock).toBeNull();
    expect(timerPaused()).toBe(false);
    expect(readPauseSession('u')).toBeNull();
    expect(state.pauses).toEqual({});
  });
});

describe('retomar', () => {
  it('a pausa vira registro, o bloco fica mais longo com o mesmo XP, e o timer segue nele e emenda no horário novo', () => {
    startTimer(estudo3, AGORA);
    pauseTimer(AGORA);
    vi.setSystemTime(em('10:17:00'));
    expect(resumeTimer(em('10:17:00'))).toBe('resumed');

    expect(state.pauses[HOJE]).toEqual([{ at: '10:10', mins: 7 }]);
    expect(timerPaused()).toBe(false);
    expect(readPauseSession('u')).toBeNull();
    expect(wakeLockWanted()).toBe(true); // o foco continua aberto
    const bloco = derived.timerBlock!;
    expect(bloco).toMatchObject({ time: '10:00', endTime: '10:32', paused: 7, xp: 50 });
    expect(bloco).toBe(blocksForDay(HOJE).find((b) => b.time === '10:00')); // é o bloco regenerado, não um snapshot
    expect(timerProgress(bloco, em('10:17:00')).display).toBe('15:00');

    relogioEm('10:31:58'); // 10:31:59 — ainda falta 1s
    expect(derived.timerBlock).toBe(bloco);
    relogioEm('10:31:59'); // 10:32:00, o fim novo: check + emenda na pausa, que agora começa às 10:32
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(true);
    expect(derived.timerBlock).toMatchObject({ type: 'pausa', time: '10:32', endTime: '10:37' });
    expect(derived.timerCompleted).toMatchObject({ name: 'Estudo 3', xp: 50, coins: 25 });
  });

  it('o dia com pausa vale o mesmo em XP, moedas e meta que o dia sem pausa', () => {
    const semPausa = blocksForDay(HOJE);
    startTimer(estudo3, AGORA);
    pauseTimer(AGORA);
    vi.setSystemTime(em('10:17:00'));
    resumeTimer(em('10:17:00'));
    const comPausa = blocksForDay(HOJE);
    for (const b of comPausa) if (b.time === '10:00') expect(blockMins(b)).toBe(25);
    // Marca os mesmos estudos (os 6 primeiros) nos dois mundos e compara o que hoje rende.
    const marcar = (blocks: StudyBlock[]) => {
      state.checks = {};
      for (const b of blocks.filter((x) => x.type === 'estudo').slice(0, 6)) toggleBlockCheck(HOJE, b, em('17:00:00'));
      return computeStatsNow(em('17:00:00'));
    };
    const com = marcar(comPausa);
    state.pauses = {};
    clearBlockCache();
    const sem = marcar(semPausa);
    expect(com.todayXP).toBe(sem.todayXP);
    expect(com.todayCoins).toBe(sem.todayCoins);
    expect(com.dayStudyMins[HOJE]).toBe(sem.dayStudyMins[HOJE]);
  });

  it('checks feitos adiantado e grupos acompanham os blocos que deslizaram', () => {
    const estudo4 = blocksForDay(HOJE).find((b) => b.time === '10:30')!;
    toggleBlockCheck(HOJE, estudo4, AGORA); // marcou o próximo antes da hora
    expect(addGroup(HOJE, { start: '10:00', end: '10:55', name: 'Análise', goal: '' }).ok).toBe(true);
    startTimer(estudo3, AGORA);
    pauseTimer(AGORA);
    vi.setSystemTime(em('10:17:00'));
    resumeTimer(em('10:17:00'));
    expect(state.checks[HOJE]).toEqual({ '10:37': { pet: null, bonus: 0 } }); // o Estudo 4 agora é 10:37–11:02
    expect(state.groups[HOJE]![0]).toMatchObject({ start: '10:00', end: '11:02' });
  });

  it('a pausa que atravessa o fim do bloco (contra o fim da janela) para o timer sem check nem emenda', () => {
    state.windowOverrides[HOJE] = { studyWindows: [{ start: '09:00', end: '10:25' }] }; // Estudo 3 é o último do dia
    clearBlockCache();
    startTimer(estudo3, AGORA);
    pauseTimer(em('10:15:00'));
    vi.setSystemTime(em('10:40:00'));
    expect(resumeTimer(em('10:40:00'))).toBe('ended');
    expect(state.pauses[HOJE]).toEqual([{ at: '10:15', mins: 25 }]);
    expect(blocksForDay(HOJE).find((b) => b.time === '10:00')).toMatchObject({ endTime: '10:25', paused: 10, xp: 30 }); // 15 min que valem
    expect(derived.timerBlock).toBeNull();
    expect(derived.focusOpen).toBe(false);
    expect(state.checks[HOJE]).toBeUndefined();
  });

  // O plano só guarda a pausa em minutos cheios, e arredonda pra cima. Sem o fim ajustado
  // (`derived.timerEndsAt`), esse arredondamento aparecia no relógio: pausar 10s devolvia
  // o bloco ~50s mais gordo do que o número que ficou congelado na tela.
  it('o relógio volta exatamente de onde parou, mesmo com o plano arredondando a pausa pra cima', () => {
    startTimer(estudo3, AGORA);
    pauseTimer(AGORA);
    const congelado = timerProgress(estudo3, AGORA, AGORA.getTime()).display;
    expect(congelado).toBe('15:00');

    vi.setSystemTime(em('10:10:10')); // 10 segundos de pausa
    expect(resumeTimer(em('10:10:10'))).toBe('resumed');
    expect(state.pauses[HOJE]).toEqual([{ at: '10:10', mins: 1 }]); // o plano ganha o minuto cheio
    const bloco = derived.timerBlock!;
    expect(bloco).toMatchObject({ endTime: '10:26', paused: 1 });
    expect(timerProgress(bloco, em('10:10:10'), null, derived.timerEndsAt).display).toBe(congelado);

    // E o bloco termina onde o relógio termina: 10:25:10, não no 10:26 do plano.
    relogioEm('10:25:08'); // 10:25:09 — ainda falta 1s
    expect(derived.timerBlock).toBe(bloco);
    relogioEm('10:25:09'); // 10:25:10, o fim ajustado
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(true);
    expect(derived.timerBlock).toMatchObject({ type: 'pausa', time: '10:26' }); // a emenda é pelo plano
  });

  it('duas pausas seguidas: a segunda congela o relógio já ajustado pela primeira', () => {
    startTimer(estudo3, AGORA);
    pauseTimer(AGORA);
    vi.setSystemTime(em('10:10:10'));
    resumeTimer(em('10:10:10')); // volta com 15:00

    vi.setSystemTime(em('10:11:10'));
    expect(pauseTimer(em('10:11:10'))).toEqual({ ok: true });
    const congelado = timerProgress(derived.timerBlock!, em('10:11:10'), em('10:11:10').getTime(), derived.timerEndsAt).display;
    expect(congelado).toBe('14:00');
    vi.setSystemTime(em('10:11:30'));
    resumeTimer(em('10:11:30'));
    expect(timerProgress(derived.timerBlock!, em('10:11:30'), null, derived.timerEndsAt).display).toBe(congelado);
  });

  it('o bloco sem pra onde crescer encurta mesmo: o relógio volta menor, e é verdade', () => {
    state.events[HOJE] = [{ name: '👥 Reunião', start: '10:25', end: '11:00', countsAsStudy: false }];
    clearBlockCache();
    startTimer(blocksForDay(HOJE).find((b) => b.time === '10:00')!, AGORA);
    pauseTimer(AGORA);
    vi.setSystemTime(em('10:13:00')); // 3 min parado, e a reunião às 10:25 não sai do lugar
    expect(resumeTimer(em('10:13:00'))).toBe('resumed');
    const bloco = derived.timerBlock!;
    expect(bloco).toMatchObject({ endTime: '10:25', paused: 3 }); // o fim é o mesmo: o estudo é que encolheu
    expect(timerProgress(bloco, em('10:13:00'), null, derived.timerEndsAt).display).toBe('12:00'); // não 15:00
  });

  it('com o foco fechado (só a barra) a pausa funciona igual', () => {
    startTimer(estudo3, AGORA);
    closeFocus();
    pauseTimer(AGORA);
    vi.setSystemTime(em('10:12:00'));
    resumeTimer(em('10:12:00'));
    expect(derived.focusOpen).toBe(false);
    expect(wakeLockWanted()).toBe(false);
    expect(derived.timerBlock).toMatchObject({ endTime: '10:27', paused: 2 });
  });

  it('encerrar o dia com o timer pausado para o timer; a pausa não vira registro', () => {
    toggleBlockCheck(HOJE, blocksForDay(HOJE)[0]!, AGORA);
    startTimer(estudo3, AGORA);
    pauseTimer(AGORA);
    closeDay(em('10:15:00'));
    expect(derived.timerBlock).toBeNull();
    expect(timerPaused()).toBe(false);
    expect(state.pauses).toEqual({});
    expect(resumeTimer(em('10:16:00'))).toBe('none');
  });
});

describe('a pausa que ficou aberta no dispositivo', () => {
  it('ao abrir o app de novo, o timer volta pausado na barra, e retomar registra desde o instante da pausa', () => {
    startTimer(estudo3, AGORA);
    pauseTimer(AGORA);
    // "Reload": o runtime some, o dispositivo lembra.
    derived.timerBlock = null;
    derived.timerPausedAt = null;
    derived.focusOpen = false;
    vi.setSystemTime(em('10:20:00'));
    expect(resumePauseOnBoot(em('10:20:00'))).toBe('resumed');
    expect(derived.timerBlock).toMatchObject({ time: '10:00', endTime: '10:25' });
    expect(derived.timerPausedAt).toBe(AGORA.getTime());
    expect(derived.focusOpen).toBe(false);
    expect(timerProgress(derived.timerBlock!, em('10:20:00'), derived.timerPausedAt)).toMatchObject({ phase: 'paused', display: '15:00' });
    vi.setSystemTime(em('10:22:00'));
    expect(resumeTimer(em('10:22:00'))).toBe('resumed');
    expect(state.pauses[HOJE]).toEqual([{ at: '10:10', mins: 12 }]);
    expect(derived.timerBlock).toMatchObject({ time: '10:00', endTime: '10:37' });
  });

  it('de outro dia, ou com o dia encerrado, é esquecida', () => {
    writePauseSession('u', { dateKey: '2026-09-01', block: estudo3, pausedAt: em('10:10:00').getTime() - 86400000 });
    expect(resumePauseOnBoot(AGORA)).toBe('expired');
    expect(derived.timerBlock).toBeNull();
    expect(readPauseSession('u')).toBeNull();
    writePauseSession('u', { dateKey: HOJE, block: estudo3, pausedAt: AGORA.getTime() });
    state.closedDays = { [HOJE]: true };
    expect(resumePauseOnBoot(AGORA)).toBe('expired');
    expect(derived.timerBlock).toBeNull();
  });

  it('se o hardcore já retomou a sessão dele, a pausa é esquecida sem mexer no timer', () => {
    state.config.hardcore = { enabled: true };
    writePauseSession('u', { dateKey: HOJE, block: estudo3, pausedAt: AGORA.getTime() });
    startHardcore(estudo3, AGORA); // no boot, o hardcore volta primeiro — e iniciar um bloco esquece a pausa do dispositivo
    expect(readPauseSession('u')).toBeNull();
    expect(resumePauseOnBoot(AGORA)).toBe('none');
    expect(derived.timerBlock).toBe(estudo3);
    expect(derived.hardcore).not.toBeNull();
    expect(timerPaused()).toBe(false);
  });

  it('sem nada no dispositivo, nada acontece', () => {
    expect(resumePauseOnBoot(AGORA)).toBe('none');
  });
});

describe('a meia-noite pausado', () => {
  it('encerra o timer sem registrar nada', () => {
    vi.setSystemTime(em('23:50:00'));
    state.windowOverrides[HOJE] = { studyWindows: [{ start: '23:30', end: '23:59' }] };
    clearBlockCache();
    const tarde = blocksForDay(HOJE)[0]!;
    startTimer(tarde, em('23:50:00'));
    pauseTimer(em('23:50:00'));
    vi.setSystemTime(new Date('2026-09-03T00:00:30'));
    reconcileTimer(new Date('2026-09-03T00:00:30'));
    expect(derived.timerBlock).toBeNull();
    expect(timerPaused()).toBe(false);
    expect(state.pauses).toEqual({});
  });
});
