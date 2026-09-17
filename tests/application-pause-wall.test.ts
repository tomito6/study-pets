// A pausa contra uma parede (src/application/pause.ts, 2026-09-17): um estudo colado num
// compromisso (ou no fim da janela) não tem pra onde crescer, e cada minuto pausado sai DELE.
// O app já fazia isso por baixo — o que faltava era DIZER: o toast de retomar contava "o dia
// anda 6 min" quando o dia não andava nada, e nada avisava enquanto a pessoa decidia entre
// esperar, retomar e "Parar por aqui". Aqui: o toast honesto em cada caso, a prévia minuto a
// minuto (`pauseOutlookNow`) que não escreve nada, e o mesmo nos dois modos (rotina e ao vivo).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialDayEnd, resetEndOfDayPrompt } from '../src/application/dayEnd';
import { setDayMode } from '../src/application/dayWindows';
import { startLive } from '../src/application/live';
import { pauseOutlookNow, pauseTimer, resumeTimer } from '../src/application/pause';
import { blocksForDay, clearBlockCache, rebuildWeeks } from '../src/application/plan';
import { startTimer, stopTimer } from '../src/application/timer';
import { emptyPersistedState } from '../src/domain/persistence';
import { blockMins } from '../src/domain/time';
import { timerProgress } from '../src/domain/timer';
import type { StudyBlock, StudyEvent } from '../src/domain/types';
import { useHardcoreStorage } from '../src/infrastructure/hardcoreSession';
import { usePauseStorage } from '../src/infrastructure/pauseSession';
import { showToast } from '../src/shared/toast';
import { derived, state } from '../src/store/store';

vi.mock('../src/shared/toast', () => ({ showToast: vi.fn() }));

const HOJE = '2026-09-02';
const em = (hms: string) => new Date(`${HOJE}T${hms}`);
// Plano padrão (09:00–18:00, pomo 25 / pausa 5 / longa 20, sem refeição neste estado): Estudo 3 é 10:00–10:25.
const reuniao: StudyEvent = { name: '👥 Reunião', start: '10:25', end: '11:00', countsAsStudy: false };

const ultimoToast = (): string => {
  const calls = vi.mocked(showToast).mock.calls;
  return String(calls[calls.length - 1]?.[0] ?? '');
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(em('10:10:00'));
  vi.mocked(showToast).mockClear();
  usePauseStorage(null);
  useHardcoreStorage(null);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  Object.assign(derived, { timerBlock: null, timerDay: null, timerPausedAt: null, timerEndsAt: null, focusOpen: false, timerCompleted: null, hardcore: null, dayEnd: initialDayEnd() });
  clearBlockCache();
  resetEndOfDayPrompt();
  rebuildWeeks(em('10:10:00'));
});

afterEach(() => {
  stopTimer();
  vi.useRealTimers();
});

/** O Estudo 3 rodando desde as 10:10, com os eventos dados no dia. */
function estudo3Rodando(events: StudyEvent[] = []): StudyBlock {
  if (events.length) state.events[HOJE] = events;
  clearBlockCache();
  const bloco = blocksForDay(HOJE).find((b) => b.time === '10:00')!;
  startTimer(bloco, em('10:10:00'));
  return bloco;
}

describe('o toast de retomar diz o que a pausa fez de verdade', () => {
  it('colado num compromisso: o estudo encolheu, e o toast diz isso — não que o dia andou', () => {
    estudo3Rodando([reuniao]);
    expect(pauseTimer(em('10:10:00'))).toEqual({ ok: true });
    vi.setSystemTime(em('10:13:00'));
    expect(resumeTimer(em('10:13:00'))).toBe('resumed');
    expect(ultimoToast()).toBe('⏸ Pausa de 3 min · Estudo 3 fica com 22 min · a 👥 Reunião das 10:25 não espera');
    expect(ultimoToast()).not.toContain('o dia anda');
    // E o plano é isso mesmo: mesmo fim, 3 min pausados, 22 que valem (10 estudados + 12 que restam), relógio com 12:00.
    const bloco = derived.timerBlock!;
    expect(bloco).toMatchObject({ endTime: '10:25', paused: 3 });
    expect(blockMins(bloco)).toBe(22);
    expect(timerProgress(bloco, em('10:13:00'), null, derived.timerEndsAt).display).toBe('12:00');
  });

  it('colado no fim da janela: a parede é a janela', () => {
    state.windowOverrides[HOJE] = { studyWindows: [{ start: '09:00', end: '10:25' }] };
    estudo3Rodando();
    pauseTimer(em('10:10:00'));
    vi.setSystemTime(em('10:13:00'));
    expect(resumeTimer(em('10:13:00'))).toBe('resumed');
    expect(ultimoToast()).toBe('⏸ Pausa de 3 min · Estudo 3 fica com 22 min · a janela acaba às 10:25');
  });

  it('com espaço, continua contando o dia que anda — e quem encolheu pra abrir espaço, pelo nome', () => {
    estudo3Rodando();
    pauseTimer(em('10:10:00'));
    vi.setSystemTime(em('10:13:00'));
    expect(resumeTimer(em('10:13:00'))).toBe('resumed');
    const toast = ultimoToast();
    expect(toast).toContain('⏸ Pausa de 3 min · o dia anda 3 min');
    expect(toast).toMatch(/Estudo \d+ fica com 17 min/); // o último estudo do dia (20 min), espremido contra as 18:00
    expect(toast).not.toContain('não espera');
    expect(toast).not.toContain('acaba às');
  });

  it('uma pausa curta entre o bloco e o compromisso é comida primeiro; só depois o estudo encolhe', () => {
    estudo3Rodando([{ ...reuniao, start: '10:30' }]); // Estudo 3 10:00–10:25 · Pausa 10:25–10:30 · Reunião 10:30
    pauseTimer(em('10:10:00'));
    vi.setSystemTime(em('10:16:00'));
    expect(resumeTimer(em('10:16:00'))).toBe('resumed');
    // 6 min pausados: 5 comeram a pausa curta (o dia anda 5), 1 saiu do estudo (24 min).
    expect(ultimoToast()).toBe('⏸ Pausa de 6 min · o dia anda 5 min · Estudo 3 fica com 24 min · a 👥 Reunião das 10:30 não espera');
    expect(derived.timerBlock).toMatchObject({ endTime: '10:30', paused: 6 });
  });

  it('a pausa que atravessa o compromisso: o bloco acaba pausado, e o toast diz com quantos minutos ele ficou', () => {
    estudo3Rodando([reuniao]);
    pauseTimer(em('10:10:00'));
    vi.setSystemTime(em('10:40:00'));
    expect(resumeTimer(em('10:40:00'))).toBe('ended');
    expect(ultimoToast()).toBe('O bloco terminou durante a pausa — Estudo 3 ficou com 10 min; marque à mão se quiser ✓');
    const bloco = blocksForDay(HOJE).find((b) => b.time === '10:00')!;
    expect(bloco).toMatchObject({ endTime: '10:25', paused: 15 });
    expect(blockMins(bloco)).toBe(10); // os 10 minutos estudados antes de pausar
    expect(state.checks[HOJE]).toBeUndefined(); // sem check sozinho: quem quiser marca à mão
  });

  it('a pausa que começa no primeiro minuto e cobre o bloco inteiro: ele saiu do plano, e não há o que marcar', () => {
    estudo3Rodando([reuniao]);
    startTimer(blocksForDay(HOJE).find((b) => b.time === '10:00')!, em('10:00:00'));
    pauseTimer(em('10:00:10'));
    vi.setSystemTime(em('10:30:00'));
    expect(resumeTimer(em('10:30:00'))).toBe('ended');
    expect(ultimoToast()).toBe('A pausa cobriu Estudo 3 inteiro: ele saiu do plano');
    expect(blocksForDay(HOJE).find((b) => b.time === '10:00')).toBeUndefined();
  });
});

describe('pauseOutlookNow — a prévia enquanto o relógio está congelado', () => {
  it('conta a perda minuto a minuto, sem escrever nada', () => {
    estudo3Rodando([reuniao]);
    pauseTimer(em('10:10:00'));
    // 30 s pausados já são 1 min pro plano (ele arredonda pra cima): o bloco já vale 24.
    expect(pauseOutlookNow(em('10:10:30'))).toEqual({
      block: 'Estudo 3',
      grew: 0,
      lost: 1,
      minsAfter: 24,
      wall: { kind: 'event', name: '👥 Reunião', at: '10:25' },
      squeezed: [],
    });
    expect(pauseOutlookNow(em('10:13:00'))).toMatchObject({ lost: 3, minsAfter: 22 });
    // Nada foi escrito: nem registro, nem plano, nem cache.
    expect(state.pauses[HOJE]).toBeUndefined();
    expect(blocksForDay(HOJE).find((b) => b.time === '10:00')).toMatchObject({ endTime: '10:25' });
    expect(blocksForDay(HOJE).find((b) => b.time === '10:00')!.paused).toBeUndefined();
    // E retomar entrega exatamente o que a prévia disse.
    vi.setSystemTime(em('10:13:00'));
    resumeTimer(em('10:13:00'));
    expect(blockMins(derived.timerBlock!)).toBe(22);
  });

  it('com espaço, é o dia que anda', () => {
    estudo3Rodando();
    pauseTimer(em('10:10:00'));
    const o = pauseOutlookNow(em('10:13:00'))!;
    expect(o).toMatchObject({ block: 'Estudo 3', grew: 3, lost: 0, minsAfter: 25, wall: null });
    expect(o.squeezed).toHaveLength(1);
    expect(o.squeezed[0]).toMatchObject({ mins: 17 }); // o último estudo do dia tinha 20
  });

  it('a segunda pausa parte do bloco já esticado pela primeira', () => {
    estudo3Rodando([reuniao]);
    pauseTimer(em('10:10:00'));
    vi.setSystemTime(em('10:13:00'));
    resumeTimer(em('10:13:00')); // 3 min: o bloco vale 22
    pauseTimer(em('10:14:00'));
    // Mais 2 min: 5 pausados no total, o bloco vale 20 — e não "22 − 5" nem "25 − 2".
    expect(pauseOutlookNow(em('10:16:00'))).toMatchObject({ lost: 2, minsAfter: 20 });
  });

  it('sem timer, rodando, ou pausa de outro dia: null', () => {
    expect(pauseOutlookNow(em('10:10:00'))).toBeNull();
    estudo3Rodando();
    expect(pauseOutlookNow(em('10:12:00'))).toBeNull(); // rodando: nada a prever
    pauseTimer(em('10:12:00'));
    expect(pauseOutlookNow(new Date('2026-09-03T00:10:00'))).toBeNull(); // a meia-noite passou: outro caminho cuida
  });
});

describe('num dia ao vivo', () => {
  /** A corrida do primeiro pomodoro: 09:12–09:37, ritmo padrão. */
  function corridaComecada(events: StudyEvent[] = []): StudyBlock {
    if (events.length) state.events[HOJE] = events;
    vi.setSystemTime(em('09:12:00'));
    rebuildWeeks(em('09:12:00'));
    setDayMode(HOJE, 'live', em('09:12:00'));
    const r = startLive(HOJE, em('09:12:00'));
    if (!r.ok) throw new Error('a corrida não começou');
    startTimer(r.block, em('09:12:00'));
    return r.block;
  }

  it('o fim da corrida não é parede — ela cresce junto, como ao retomar', () => {
    corridaComecada();
    pauseTimer(em('09:20:00'));
    expect(pauseOutlookNow(em('09:23:00'))).toMatchObject({ grew: 3, lost: 0, minsAfter: 25, wall: null, squeezed: [] });
    expect(state.windowOverrides[HOJE]!.studyWindows[0]).toMatchObject({ end: '09:37' }); // a prévia não escreveu
    vi.setSystemTime(em('09:23:00'));
    expect(resumeTimer(em('09:23:00'))).toBe('resumed');
    expect(ultimoToast()).toBe('⏸ Pausa de 3 min · o dia anda 3 min · termina às 09:40');
    expect(state.windowOverrides[HOJE]!.studyWindows[0]).toMatchObject({ end: '09:40' }); // retomar, sim
  });

  it('mas um compromisso colado na corrida é parede igual', () => {
    corridaComecada([{ ...reuniao, start: '09:37', end: '10:00' }]);
    pauseTimer(em('09:20:00'));
    expect(pauseOutlookNow(em('09:23:00'))).toMatchObject({ grew: 0, lost: 3, minsAfter: 22, wall: { kind: 'event', at: '09:37' } });
    vi.setSystemTime(em('09:23:00'));
    expect(resumeTimer(em('09:23:00'))).toBe('resumed');
    expect(ultimoToast()).toBe('⏸ Pausa de 3 min · Estudo 1 fica com 22 min · a 👥 Reunião das 09:37 não espera');
  });
});
