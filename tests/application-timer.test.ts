// Caso de uso do timer: início (inclusive antes da hora), o que o modo foco faz
// no fim do bloco (check automático + emenda no seguinte), parar, foco, áudio.
// Sem DOM: Web Audio, Notification e toast não existem em Node, e o código engole isso.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkBlock, toggleBlockCheck } from '../src/application/checks';
import { blocksForDay, rebuildWeeks } from '../src/application/plan';
import { closeFocus, setVolume, startTimer, stopTimer, toggleMute, tryStartTimer } from '../src/application/timer';
import { isChecked } from '../src/domain/checks';
import { emptyPersistedState } from '../src/domain/persistence';
import type { StudyBlock } from '../src/domain/types';
import { derived, state, subscribe } from '../src/store/store';

const HOJE = '2026-09-02';
const AGORA = new Date('2026-09-02T10:10:00');
// Plano padrão (09:00, pomo 25 / pausa 5): Estudo 3 é 10:00–10:25, a pausa 10:25–10:30, Estudo 4 10:30–10:55.
const bloco: StudyBlock = { time: '10:00', endTime: '10:25', name: '📖 Estudo 3', type: 'estudo', xp: 50, session: 0 };

/** Põe o relógio falso em `hh:mm:ss` de hoje e deixa o watcher de 1s perceber (ele vê 1s depois). */
function relogioEm(hms: string): void {
  vi.setSystemTime(new Date(`${HOJE}T${hms}`));
  vi.advanceTimersByTime(1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), { uiWeek: 1, uiDay: 2 });
  derived.timerBlock = null;
  derived.focusOpen = false;
  derived.timerCompleted = null;
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

  it('aceita um bloco de hoje que ainda não começou — fica em espera até a hora', () => {
    const futuro = { ...bloco, time: '10:30', endTime: '10:55', name: '📖 Estudo 4' };
    expect(tryStartTimer(futuro, AGORA)).toEqual({ ok: true });
    expect(derived.timerBlock).toBe(futuro);
    expect(derived.focusOpen).toBe(true);
    vi.advanceTimersByTime(60_000); // 10:11 — esperando, nada termina
    expect(derived.timerBlock).toBe(futuro);
  });

  it('recusa bloco que já terminou', () => {
    const r = tryStartTimer({ ...bloco, time: '09:00', endTime: '09:25' }, AGORA);
    expect(r).toEqual({ ok: false, reason: 'ended' });
    expect(derived.timerBlock).toBeNull();
    expect(derived.focusOpen).toBe(false);
  });

  it('recusa quando a aba mostra outro dia', () => {
    state.uiDay = 3; // quinta
    expect(tryStartTimer(bloco, AGORA)).toEqual({ ok: false, reason: 'not-today' });
  });
});

describe('fim do bloco no modo foco', () => {
  it('marca o check sozinho e emenda na pausa, e da pausa no estudo seguinte', () => {
    startTimer(bloco);
    relogioEm('10:24:58');
    expect(derived.timerBlock).toBe(bloco); // 10:24:59 — ainda falta 1s
    expect(state.checks[HOJE]).toBeUndefined();

    vi.advanceTimersByTime(1000); // 10:25:00 — fim do estudo
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(true);
    expect(derived.timerBlock).toMatchObject({ type: 'pausa', time: '10:25', endTime: '10:30' });
    expect(derived.focusOpen).toBe(true);
    expect(derived.timerCompleted).toMatchObject({ name: 'Estudo 3', type: 'estudo', xp: 50, coins: 25 });

    relogioEm('10:29:59'); // 10:30:00 — fim da pausa
    expect(isChecked(state.checks, HOJE, '10:25')).toBe(true);
    expect(derived.timerBlock).toMatchObject({ type: 'estudo', time: '10:30', endTime: '10:55' });
    expect(derived.focusOpen).toBe(true);
    expect(derived.timerCompleted).toMatchObject({ name: 'Pausa', type: 'pausa', xp: 5, coins: 0 });
  });

  it('não desmarca um check feito à mão no meio do bloco', () => {
    startTimer(bloco);
    toggleBlockCheck(HOJE, bloco, AGORA);
    relogioEm('10:24:59');
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(true);
    expect(derived.timerBlock).toMatchObject({ type: 'pausa', time: '10:25' });
    expect(derived.timerCompleted).toMatchObject({ name: 'Estudo 3', xp: 0, coins: 0 }); // nada a creditar de novo
  });

  it('com o foco fechado, o fim é como sempre: sem check, e o timer some', () => {
    startTimer(bloco);
    closeFocus();
    relogioEm('10:24:59');
    expect(state.checks[HOJE]).toBeUndefined();
    expect(derived.timerBlock).toBeNull();
    expect(derived.focusOpen).toBe(false);
  });

  it('a sequência para no almoço: marca o bloco e fecha o foco', () => {
    const dia = blocksForDay(HOJE);
    const idxAlmoco = dia.findIndex((b) => b.type === 'almoco');
    const antes = dia[idxAlmoco - 1]!;
    expect(antes.type).toBe('estudo');
    vi.setSystemTime(new Date(`${HOJE}T${antes.time}:30`));
    startTimer(antes);
    relogioEm(`${antes.endTime}:00`);
    expect(isChecked(state.checks, HOJE, antes.time)).toBe(true);
    expect(derived.timerBlock).toBeNull();
    expect(derived.focusOpen).toBe(false);
    expect(derived.timerCompleted).toBeNull();
  });

  it('o último estudo do dia também: marca e fecha', () => {
    const dia = blocksForDay(HOJE);
    const ultimo = dia[dia.length - 1]!;
    expect(ultimo.type).toBe('estudo'); // o dia sempre termina em estudo
    vi.setSystemTime(new Date(`${HOJE}T${ultimo.time}:30`));
    startTimer(ultimo);
    relogioEm(`${ultimo.endTime}:00`);
    expect(isChecked(state.checks, HOJE, ultimo.time)).toBe(true);
    expect(derived.timerBlock).toBeNull();
    expect(derived.focusOpen).toBe(false);
  });

  it('dia encerrado no meio: sem check e sem emenda — o fim vira o de sempre', () => {
    startTimer(bloco);
    state.closedDays = { [HOJE]: true };
    relogioEm('10:24:59');
    expect(state.checks[HOJE]).toBeUndefined();
    expect(derived.timerBlock).toBeNull();
    expect(derived.focusOpen).toBe(false);
  });
});

describe('checkBlock — marcar sem desmarcar', () => {
  it('marca uma vez; a segunda chamada não faz nada', () => {
    expect(checkBlock(HOJE, bloco, AGORA)).toEqual({ checked: true, xp: 50, coins: 25 });
    expect(checkBlock(HOJE, bloco, AGORA)).toBeNull();
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(true);
  });

  it('respeita dia encerrado e dia futuro', () => {
    state.closedDays = { [HOJE]: true };
    expect(checkBlock(HOJE, bloco, AGORA)).toBeNull();
    expect(checkBlock('2026-09-03', bloco, AGORA)).toBeNull();
    expect(state.checks).toEqual({});
  });
});

describe('ciclo de vida', () => {
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
    relogioEm('10:26:00');
    expect(derived.timerBlock).toBe(outro); // o fim do primeiro (10:25) não derruba o segundo
  });

  it('iniciar um bloco limpa a faixa de concluído da sequência anterior', () => {
    startTimer(bloco);
    relogioEm('10:24:59');
    expect(derived.timerCompleted).not.toBeNull();
    startTimer({ ...bloco, time: '10:30', endTime: '10:55' });
    expect(derived.timerCompleted).toBeNull();
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
