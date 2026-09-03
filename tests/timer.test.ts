import { describe, expect, it } from 'vitest';
import {
  blockDurationMin,
  blockNumberInSession,
  canStartBlock,
  chainedBlockAfter,
  cleanBlockName,
  formatCountdown,
  formatMMSS,
  nextBlockAfter,
  soundForBlock,
  timerProgress,
} from '../src/domain/timer';
import type { StudyBlock } from '../src/domain/types';

const estudo = (time: string, endTime: string, session = 0): StudyBlock => ({
  time, endTime, name: `📖 Estudo ${time}`, type: 'estudo', xp: 50, session,
});
const pausa = (time: string, endTime: string, session = 0, longa = false): StudyBlock => ({
  time, endTime, name: longa ? '☕ Pausa longa' : '🧘 Pausa', type: 'pausa', xp: 5, session,
});
const almoco = (time: string, endTime: string): StudyBlock => ({
  time, endTime, name: '🍽️ Almoço', type: 'almoco', xp: 0, session: 0,
});

describe('timerProgress — o restante vem do relógio, não de um contador', () => {
  const b = estudo('10:00', '10:25');

  it('no meio do bloco', () => {
    const p = timerProgress(b, new Date('2026-09-02T10:10:00'));
    expect(p).toMatchObject({
      phase: 'running', totalSec: 1500, remainingSec: 900, display: '15:00', untilStartSec: 0,
      ending: false, pct: 40, done: false,
    });
  });

  it('antes de começar está em espera: anel cheio, contagem até o início', () => {
    const p = timerProgress(b, new Date('2026-09-02T09:48:30'));
    expect(p).toMatchObject({
      phase: 'waiting', untilStartSec: 690, untilStartDisplay: '11:30',
      remainingSec: 1500, display: '25:00', pct: 0, elapsedFraction: 0, ending: false, done: false,
    });
  });

  it('em espera a contagem nunca mostra 00:00 — no segundo em que zera, já está rodando', () => {
    expect(timerProgress(b, new Date('2026-09-02T09:59:59.200'))).toMatchObject({ phase: 'waiting', untilStartDisplay: '00:01' });
    expect(timerProgress(b, new Date('2026-09-02T10:00:00'))).toMatchObject({ phase: 'running', display: '25:00' });
  });

  it('último minuto marca ending', () => {
    expect(timerProgress(b, new Date('2026-09-02T10:24:30')).ending).toBe(true);
    expect(timerProgress(b, new Date('2026-09-02T10:23:59')).ending).toBe(false);
  });

  it('depois do fim está done, com 00:00 e 100%', () => {
    const p = timerProgress(b, new Date('2026-09-02T10:30:00'));
    expect(p).toMatchObject({ phase: 'done', remainingSec: 0, display: '00:00', done: true, pct: 100 });
  });

  it('sobrevive a "reload": recalcular mais tarde dá o mesmo que contar', () => {
    const a = timerProgress(b, new Date('2026-09-02T10:05:00')).remainingSec;
    const depois = timerProgress(b, new Date('2026-09-02T10:05:42')).remainingSec;
    expect(a - depois).toBe(42);
  });
});

describe('canStartBlock — bloco de hoje que ainda não terminou', () => {
  const b = estudo('10:00', '10:25');
  const HOJE = '2026-09-02';

  it('aceita durante o bloco, no dia visível = hoje', () => {
    expect(canStartBlock(b, HOJE, new Date('2026-09-02T10:10:00'))).toEqual({ ok: true });
  });

  it('aceita bloco que ainda não começou — vai ficar em espera', () => {
    expect(canStartBlock(b, HOJE, new Date('2026-09-02T09:48:00'))).toEqual({ ok: true });
  });

  it('recusa se a aba mostra outro dia', () => {
    expect(canStartBlock(b, '2026-09-03', new Date('2026-09-02T10:10:00'))).toEqual({ ok: false, reason: 'not-today' });
  });

  it('recusa bloco que já terminou', () => {
    expect(canStartBlock(b, HOJE, new Date('2026-09-02T10:25:00'))).toEqual({ ok: false, reason: 'ended' });
  });
});

describe('helpers', () => {
  it('duração e nome limpo', () => {
    expect(blockDurationMin(estudo('09:00', '09:25'))).toBe(25);
    expect(cleanBlockName('📖 Estudo 3')).toBe('Estudo 3');
    expect(cleanBlockName('☕ Pausa longa')).toBe('Pausa longa');
    expect(formatMMSS(65)).toBe('01:05');
  });

  it('contagem regressiva: MM:SS até uma hora, H:MM:SS depois', () => {
    expect(formatCountdown(690)).toBe('11:30');
    expect(formatCountdown(3599)).toBe('59:59');
    expect(formatCountdown(3725)).toBe('1:02:05');
  });

  it('som pelo tipo e pelo nome', () => {
    expect(soundForBlock(estudo('09:00', '09:25'))).toBe('estudo');
    expect(soundForBlock(pausa('09:25', '09:30'))).toBe('pausa_curta');
    expect(soundForBlock(pausa('10:50', '11:10', 0, true))).toBe('pausa_longa');
  });

  it('número do bloco dentro da sessão e o próximo bloco', () => {
    const dia = [estudo('09:00', '09:25', 0), pausa('09:25', '09:30', 0), estudo('09:30', '09:55', 0), estudo('11:00', '11:25', 1)];
    expect(blockNumberInSession(dia, dia[2]!)).toBe(3);
    expect(blockNumberInSession(dia, dia[3]!)).toBe(1);
    expect(nextBlockAfter(dia, dia[0]!)).toBe(dia[1]);
    expect(nextBlockAfter(dia, dia[3]!)).toBeNull();
  });

  it('emenda só em estudo/pausa que começa quando este acaba', () => {
    const dia = [
      estudo('09:00', '09:25'),
      pausa('09:25', '09:30'),
      estudo('09:30', '09:55'),
      estudo('11:00', '11:25', 1),
      almoco('11:25', '12:25'),
      estudo('12:25', '12:50', 1),
    ];
    expect(chainedBlockAfter(dia, dia[0]!)).toBe(dia[1]); // estudo → pausa
    expect(chainedBlockAfter(dia, dia[1]!)).toBe(dia[2]); // pausa → estudo
    expect(chainedBlockAfter(dia, dia[2]!)).toBeNull(); // gap até 11:00
    expect(chainedBlockAfter(dia, dia[3]!)).toBeNull(); // almoço não emenda
    expect(chainedBlockAfter(dia, dia[5]!)).toBeNull(); // último do dia
  });
});
