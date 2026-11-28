// O modo do dia só vale no SALVAR do modal "🕘 Estrutura do dia" (2026-11-28, pedido do
// Tomi: "se a gente bota ao vivo, pelo menos dê a opção de marcar quanto de estudo pomodoro
// o user quer — ele tem que apertar salvar"). O chip só escolhe; `saveDayStructure` troca
// o modo e grava o ritmo na mesma escrita. Sem DOM.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toggleBlockCheck } from '../src/application/checks';
import { effectiveWindows, previewDayPlan, saveDayStructure, setDayMode, windowsInMode } from '../src/application/dayWindows';
import { liveRhythm, previewLive, startLive } from '../src/application/live';
import { stopHere } from '../src/application/pause';
import { blocksForDay, clearBlockCache, dayModeOf, rebuildWeeks } from '../src/application/plan';
import { startTimer, stopTimer } from '../src/application/timer';
import { emptyPersistedState } from '../src/domain/persistence';
import { derived, state } from '../src/store/store';

const HOJE = '2026-09-02'; // quarta
const AMANHA = '2026-09-03';
const em = (hm: string) => new Date(`${HOJE}T${hm}:00`);
const AGORA = em('10:10');
const R25 = { pomo: 25, shortBreak: 5, longBreak: 20 };
const R40 = { pomo: 40, shortBreak: 10, longBreak: 30 };
const ROTINA = [{ start: '09:00', end: '18:00' }];
const estudos = (dia: string) => blocksForDay(dia).filter((b) => b.type === 'estudo');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  state.config.periodStart = '2026-08-01';
  derived.timerBlock = null;
  derived.timerDay = null;
  derived.timerPausedAt = null;
  derived.timerEndsAt = null;
  derived.focusOpen = false;
  derived.hardcore = null;
  derived.weeks = [];
  clearBlockCache();
  rebuildWeeks(AGORA);
});
afterEach(() => {
  stopTimer();
  vi.useRealTimers();
});

describe('o modo do dia entra no Salvar, junto com o ritmo', () => {
  it('ao vivo com 40 min: uma escrita só, e o Começar já nasce com o ritmo escolhido', () => {
    const r = saveDayStructure(HOJE, { windows: ROTINA, rhythm: R40, mode: 'live' }, AGORA);
    expect(r).toEqual({ ok: true, windows: false, rhythm: 'whole-day', mode: true });
    expect(dayModeOf(HOJE)).toBe('live');
    expect(estudos(HOJE)).toHaveLength(0); // o dia não começou: sem plano
    expect(state.windowOverrides[HOJE]).toBeUndefined(); // e sem janela inventada
    expect(liveRhythm(AGORA)).toEqual(R40);
    const p = previewLive(HOJE, AGORA);
    expect(p.ok && `${p.block.time}–${p.block.endTime}`).toBe('10:10–10:50');
    // Só hoje: amanhã continua pela rotina, em 25.
    expect(dayModeOf(AMANHA)).toBe('rotina');
    expect(estudos(AMANHA)[0]).toMatchObject({ time: '09:00', endTime: '09:25' });
  });

  it('só trocar o modo, sem mexer no ritmo, também é uma escrita', () => {
    expect(saveDayStructure(HOJE, { windows: ROTINA, rhythm: R25, mode: 'live' }, AGORA)).toEqual({ ok: true, windows: false, rhythm: 'unchanged', mode: true });
    expect(dayModeOf(HOJE)).toBe('live');
  });

  it('o mesmo modo de novo não escreve nada', () => {
    expect(saveDayStructure(HOJE, { windows: ROTINA, rhythm: R25, mode: 'rotina' }, AGORA)).toEqual({ ok: true, windows: false, rhythm: 'unchanged', mode: false });
    expect(state.dayModes[HOJE]).toBeUndefined();
  });

  it('ritmo inválido recusa tudo: o modo não troca pela metade', () => {
    const r = saveDayStructure(HOJE, { windows: ROTINA, rhythm: { pomo: 0, shortBreak: 5, longBreak: 20 }, mode: 'live' }, AGORA);
    expect(r).toEqual({ ok: false, reason: 'invalid-rhythm' });
    expect(dayModeOf(HOJE)).toBe('rotina');
    expect(estudos(HOJE).length).toBeGreaterThan(0);
  });

  it('indo pro ao vivo as janelas do rascunho não valem — nem as inválidas recusam', () => {
    const r = saveDayStructure(HOJE, { windows: [{ start: '12:00', end: '11:00' }], rhythm: R25, mode: 'live' }, AGORA);
    expect(r).toMatchObject({ ok: true, windows: false, mode: true });
    expect(state.windowOverrides[HOJE]).toBeUndefined();
  });

  it('com a manhã marcada: ela fica como foi vivida (em 25) e o ritmo novo vale dali em diante', () => {
    const b = blocksForDay(HOJE).find((x) => x.time === '09:00')!;
    expect(toggleBlockCheck(HOJE, b, AGORA)).not.toBeNull();
    const r = saveDayStructure(HOJE, { windows: ROTINA, rhythm: R40, mode: 'live' }, AGORA);
    expect(r).toEqual({ ok: true, windows: false, rhythm: 'from-now', mode: true });
    // O estudo marcado continua no lugar, do mesmo tamanho.
    expect(estudos(HOJE)).toEqual([expect.objectContaining({ time: '09:00', endTime: '09:25' })]);
    // E a corrida que vier nasce em 40.
    const p = previewLive(HOJE, AGORA);
    expect(p.ok && `${p.block.time}–${p.block.endTime}`).toBe('10:10–10:50');
  });

  it('é a mesma troca do `setDayMode`: o estado final é idêntico', () => {
    const b = blocksForDay(HOJE).find((x) => x.time === '09:00')!;
    toggleBlockCheck(HOJE, b, AGORA);
    const antes = structuredClone({ o: state.windowOverrides, m: state.dayModes });
    saveDayStructure(HOJE, { windows: ROTINA, rhythm: R25, mode: 'live' }, AGORA);
    const peloSalvar = JSON.stringify({ o: state.windowOverrides, m: state.dayModes });
    expect(state.windowOverrides[HOJE]?.studyWindows[0]?.live).toBeTruthy(); // a manhã virou corrida
    // desfaz e refaz pelo caminho antigo
    state.windowOverrides = antes.o;
    state.dayModes = antes.m;
    clearBlockCache();
    setDayMode(HOJE, 'live', AGORA);
    expect(JSON.stringify({ o: state.windowOverrides, m: state.dayModes })).toBe(peloSalvar);
  });
});

describe('de volta pra rotina, pelo mesmo Salvar', () => {
  beforeEach(() => {
    saveDayStructure(HOJE, { windows: ROTINA, rhythm: R25, mode: 'live' }, AGORA);
  });

  it('o editor mostra as janelas que a troca deixaria, e salvar sem mexer nelas não cria janela editada', () => {
    expect(windowsInMode(HOJE, 'rotina', AGORA)).toEqual(ROTINA);
    const r = saveDayStructure(HOJE, { windows: windowsInMode(HOJE, 'rotina', AGORA), rhythm: R25, mode: 'rotina' }, AGORA);
    expect(r).toEqual({ ok: true, windows: false, rhythm: 'unchanged', mode: true });
    expect(dayModeOf(HOJE)).toBe('rotina');
    expect(state.windowOverrides[HOJE]).toBeUndefined();
    expect(estudos(HOJE)[0]).toMatchObject({ time: '09:00', endTime: '09:25' });
  });

  it('e dá pra voltar já com outra janela: modo e janelas na mesma escrita', () => {
    const r = saveDayStructure(HOJE, { windows: [{ start: '14:00', end: '18:00' }], rhythm: R25, mode: 'rotina' }, AGORA);
    expect(r).toEqual({ ok: true, windows: true, rhythm: 'unchanged', mode: true });
    expect(effectiveWindows(HOJE)).toEqual([{ start: '14:00', end: '18:00' }]);
    expect(estudos(HOJE)[0]).toMatchObject({ time: '14:00' });
  });

  it('com uma corrida vivida: voltar pra rotina minutos depois de abrir o modal não regrava a corrida', () => {
    const r = startLive(HOJE, AGORA);
    if (!r.ok) throw new Error('a corrida não começou');
    startTimer(r.block, AGORA);
    derived.focusOpen = true;
    vi.setSystemTime(em('10:22'));
    expect(stopHere(em('10:22'))).toMatchObject({ ok: true });
    // O modal abre às 10:23 (as janelas "pela rotina" começam ali) e a pessoa salva às 10:25,
    // sem tocar nas janelas: o que vai é a conta de AGORA, não a de quando abriu.
    const abertoAs = windowsInMode(HOJE, 'rotina', em('10:23'));
    const naHoraDeSalvar = windowsInMode(HOJE, 'rotina', em('10:25'));
    expect(abertoAs).not.toEqual(naHoraDeSalvar);
    const s = saveDayStructure(HOJE, { windows: naHoraDeSalvar, rhythm: R25, mode: 'rotina' }, em('10:25'));
    expect(s).toEqual({ ok: true, windows: false, rhythm: 'unchanged', mode: true });
    expect(state.windowOverrides[HOJE]?.studyWindows[0]).toMatchObject({ start: '10:10', end: '10:22', live: expect.anything() });
    // O bloco parcial fica do tamanho que foi, e a rotina volta só dali em diante.
    expect(estudos(HOJE)[0]).toMatchObject({ time: '10:10', endTime: '10:22' });
    expect(estudos(HOJE)[1]!.time >= '10:25').toBe(true);
  });

  it('num dia ao vivo, sem escolher modo, o Salvar só mexe no ritmo', () => {
    const r = saveDayStructure(HOJE, { windows: ROTINA, rhythm: R40, mode: 'live' }, AGORA);
    expect(r).toEqual({ ok: true, windows: false, rhythm: 'whole-day', mode: false });
    expect(state.windowOverrides[HOJE]).toBeUndefined();
    expect(liveRhythm(AGORA)).toEqual(R40);
  });
});

describe('a prévia do modal segue o modo ESCOLHIDO, antes do Salvar', () => {
  it('rotina salva, ao vivo escolhido: some o plano, ficam os compromissos — e nada é escrito', () => {
    state.eventSeries = [{ id: 's1', name: 'Almoço', start: '13:00', end: '14:00', weekdays: [0, 1, 2, 3, 4, 5, 6], freq: 'weekly', anchor: null, until: null, exceptions: [], countsAsStudy: false }] as never;
    clearBlockCache();
    const p = previewDayPlan(HOJE, ROTINA, R25, AGORA, 'live');
    expect(p.filter((b) => b.type === 'estudo')).toHaveLength(0);
    expect(p.map((b) => `${b.time}–${b.endTime}`)).toEqual(['13:00–14:00']);
    expect(dayModeOf(HOJE)).toBe('rotina');
    expect(estudos(HOJE).length).toBeGreaterThan(0);
  });

  it('com a manhã marcada, a prévia do ao vivo mostra o que fica: só o que foi vivido', () => {
    const b = blocksForDay(HOJE).find((x) => x.time === '09:00')!;
    toggleBlockCheck(HOJE, b, AGORA);
    const p = previewDayPlan(HOJE, ROTINA, R25, AGORA, 'live');
    expect(p.filter((x) => x.type === 'estudo').map((x) => x.time)).toEqual(['09:00']);
    // e bate com o que o Salvar deixa
    saveDayStructure(HOJE, { windows: ROTINA, rhythm: R25, mode: 'live' }, AGORA);
    expect(blocksForDay(HOJE).map((x) => `${x.type} ${x.time}–${x.endTime}`)).toEqual(p.map((x) => `${x.type} ${x.time}–${x.endTime}`));
  });

  it('ao vivo salvo, rotina escolhida: a prévia já mostra o plano das janelas do editor', () => {
    saveDayStructure(HOJE, { windows: ROTINA, rhythm: R25, mode: 'live' }, AGORA);
    const p = previewDayPlan(HOJE, windowsInMode(HOJE, 'rotina', AGORA), R25, AGORA, 'rotina');
    expect(p.filter((x) => x.type === 'estudo').length).toBeGreaterThan(10);
    expect(dayModeOf(HOJE)).toBe('live');
  });
});
