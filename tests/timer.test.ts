import { describe, expect, it } from 'vitest';
import {
  blockDurationMin,
  blockNumberInSession,
  canStartBlock,
  cleanBlockName,
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

describe('timerProgress — o restante vem do relógio, não de um contador', () => {
  const b = estudo('10:00', '10:25');

  it('no meio do bloco', () => {
    const p = timerProgress(b, new Date('2026-09-02T10:10:00'));
    expect(p).toMatchObject({ totalSec: 1500, remainingSec: 900, display: '15:00', ending: false, pct: 40, done: false });
  });

  it('último minuto marca ending', () => {
    expect(timerProgress(b, new Date('2026-09-02T10:24:30')).ending).toBe(true);
    expect(timerProgress(b, new Date('2026-09-02T10:23:59')).ending).toBe(false);
  });

  it('depois do fim está done, com 00:00 e 100%', () => {
    const p = timerProgress(b, new Date('2026-09-02T10:30:00'));
    expect(p).toMatchObject({ remainingSec: 0, display: '00:00', done: true, pct: 100 });
  });

  it('sobrevive a "reload": recalcular mais tarde dá o mesmo que contar', () => {
    const a = timerProgress(b, new Date('2026-09-02T10:05:00')).remainingSec;
    const depois = timerProgress(b, new Date('2026-09-02T10:05:42')).remainingSec;
    expect(a - depois).toBe(42);
  });
});

describe('canStartBlock — só bloco de hoje que está rolando', () => {
  const b = estudo('10:00', '10:25');
  const HOJE = '2026-09-02';

  it('aceita durante o bloco, no dia visível = hoje', () => {
    expect(canStartBlock(b, HOJE, new Date('2026-09-02T10:10:00'))).toEqual({ ok: true });
  });

  it('recusa se a aba mostra outro dia', () => {
    expect(canStartBlock(b, '2026-09-03', new Date('2026-09-02T10:10:00'))).toEqual({ ok: false, reason: 'not-today' });
  });

  it('recusa bloco que já terminou', () => {
    expect(canStartBlock(b, HOJE, new Date('2026-09-02T10:25:00'))).toEqual({ ok: false, reason: 'ended' });
  });

  it('recusa bloco que ainda não começou, dizendo em quantos minutos', () => {
    expect(canStartBlock(b, HOJE, new Date('2026-09-02T09:48:00'))).toEqual({ ok: false, reason: 'not-started', minutesUntil: 12 });
  });
});

describe('helpers', () => {
  it('duração e nome limpo', () => {
    expect(blockDurationMin(estudo('09:00', '09:25'))).toBe(25);
    expect(cleanBlockName('📖 Estudo 3')).toBe('Estudo 3');
    expect(cleanBlockName('☕ Pausa longa')).toBe('Pausa longa');
    expect(formatMMSS(65)).toBe('01:05');
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
});
