import { describe, expect, it } from 'vitest';
import { generateBlocks } from '../src/domain/planner';
import { closedCycleOf, countsForCycle, cycleSummary } from '../src/domain/cycles';
import { DEFAULT_CFG } from '../src/domain/config';
import type { BlockType, CheckRecord, StudyBlock, TimeString } from '../src/domain/types';

const b = (time: string, endTime: string, type: BlockType, cycle?: number): StudyBlock =>
  ({ time, endTime, name: type, type, xp: 0, cycle });

/** Um estudo de 25 min que vale 50 XP, como o gerador emite. */
const study = (time: string, endTime: string, cycle: number, xp = 50): StudyBlock =>
  ({ time, endTime, name: '📖 Estudo', type: 'estudo', xp, cycle });

const checks = (...times: string[]): Record<TimeString, CheckRecord> =>
  Object.fromEntries(times.map((t) => [t, { pet: null, bonus: 0 }]));

// Uma leva de dois estudos, a pausa longa, e outra leva depois.
const dia: StudyBlock[] = [
  study('09:00', '09:25', 0),
  b('09:25', '09:30', 'pausa', 0),
  study('09:30', '09:55', 0),
  b('09:55', '10:10', 'pausa', 0),
  study('10:10', '10:35', 1),
  b('10:35', '10:40', 'pausa', 1),
  study('10:40', '11:05', 1),
];

describe('o que conta pra sessão fechar', () => {
  it('estudo e evento contam; pausa e bloqueio não', () => {
    expect(countsForCycle(b('09:00', '09:25', 'estudo'))).toBe(true);
    expect(countsForCycle(b('13:00', '14:30', 'event'))).toBe(true);
    expect(countsForCycle(b('09:25', '09:30', 'pausa'))).toBe(false);
    expect(countsForCycle(b('12:00', '13:00', 'intervalo'))).toBe(false);
  });

  it('conta só os blocos da sessão pedida', () => {
    const s = cycleSummary(dia, 0, checks('09:00'));
    expect(s.total).toBe(2);
    expect(s.done).toBe(1);
    expect(s.minsDone).toBe(25);
    expect(s.complete).toBe(false);
  });

  it('pausa marcada não conta como progresso da sessão', () => {
    const s = cycleSummary(dia, 0, checks('09:00', '09:25', '09:30'));
    expect(s.done).toBe(2);
    expect(s.total).toBe(2);
    expect(s.complete).toBe(true);
  });

  it('soma XP com o bônus de skill gravado no check', () => {
    const comBonus = { '09:00': { pet: 'dog', bonus: 0.1 }, '09:30': { pet: 'dog', bonus: 0 } };
    const s = cycleSummary(dia, 0, comBonus);
    expect(s.xp).toBe(55 + 50);
    expect(s.coins).toBe(50); // 1 moeda por minuto
  });

  it('desconta o tempo pausado (blockMins, não fim − início)', () => {
    const esticado: StudyBlock[] = [
      { ...study('09:00', '09:32', 0), paused: 7 },
      study('09:37', '10:02', 0),
    ];
    const s = cycleSummary(esticado, 0, checks('09:00', '09:37'));
    expect(s.minsDone).toBe(50);
  });
});

describe('a sessão que fechou', () => {
  it('devolve o resumo quando o último bloco da leva é marcado', () => {
    const s = closedCycleOf(dia, dia[2]!, checks('09:00', '09:30'));
    expect(s).not.toBeNull();
    expect(s!.cycle).toBe(0);
    expect(s!.done).toBe(2);
    expect(s!.minsDone).toBe(50);
  });

  it('reconhece a leva fechada mesmo marcando fora de ordem', () => {
    // Marcou o segundo primeiro; quem fecha é o PRIMEIRO horário.
    const s = closedCycleOf(dia, dia[0]!, checks('09:30', '09:00'));
    expect(s).not.toBeNull();
    expect(s!.done).toBe(2);
  });

  it('não fecha enquanto falta bloco', () => {
    expect(closedCycleOf(dia, dia[0]!, checks('09:00'))).toBeNull();
  });

  it('a leva seguinte é outra sessão', () => {
    expect(closedCycleOf(dia, dia[4]!, checks('09:00', '09:30'))).toBeNull();
    expect(closedCycleOf(dia, dia[4]!, checks('10:10', '10:40'))).not.toBeNull();
  });

  it('pausa não fecha sessão nenhuma', () => {
    expect(closedCycleOf(dia, dia[1]!, checks('09:00', '09:25', '09:30'))).toBeNull();
  });

  it('sessão de um bloco só não vale comemoração', () => {
    // Um evento entre duas janelas nasce sozinho numa sessão só dele.
    const soAula = [b('13:00', '14:30', 'event', 3)];
    expect(cycleSummary(soAula, 3, checks('13:00')).complete).toBe(true);
    expect(closedCycleOf(soAula, soAula[0]!, checks('13:00'))).toBeNull();
  });

  it('bloco sem sessão (intervalo) nunca fecha nada', () => {
    const almoco = b('12:00', '13:00', 'intervalo');
    expect(closedCycleOf([...dia, almoco], almoco, checks('12:00'))).toBeNull();
  });
});

describe('em cima de um plano de verdade', () => {
  const cfg = { ...DEFAULT_CFG, studyWindows: [{ start: '09:00', end: '13:00' }] };
  const blocks = generateBlocks(cfg, [], []);
  const sessoes = [...new Set(blocks.filter((x) => x.cycle !== undefined).map((x) => x.cycle!))];

  it('o dia tem mais de uma sessão e cada uma tem estudo', () => {
    expect(sessoes.length).toBeGreaterThan(1);
    for (const s of sessoes) expect(cycleSummary(blocks, s, undefined).total).toBeGreaterThan(0);
  });

  it('marcar a primeira leva inteira fecha ela e só ela', () => {
    const primeira = blocks.filter((x) => x.cycle === sessoes[0] && countsForCycle(x));
    const day = checks(...primeira.map((x) => x.time));
    const ultimo = primeira[primeira.length - 1]!;
    expect(closedCycleOf(blocks, ultimo, day)).not.toBeNull();
    // A segunda leva continua aberta.
    const segunda = blocks.find((x) => x.cycle === sessoes[1] && countsForCycle(x))!;
    expect(closedCycleOf(blocks, segunda, day)).toBeNull();
  });
});
