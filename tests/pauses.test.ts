// As regras puras de pausar o bloco (src/domain/pauses.ts): o registro arredondado a
// favor de quem pausou, a leitura do doc, a pausa aberta no dispositivo, e a
// correspondência antes ↔ depois que checks e grupos por horário usam pra acompanhar
// os blocos que deslizaram. E um teste de higiene: duração é `blockMins`, sempre.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addPause,
  blockAt,
  normalizePauses,
  parsePauseSession,
  pauseRecordFor,
  pauseRemap,
  pauseSessionFor,
  pausesTotal,
  remapChecksForPause,
  remapGroupsForPause,
} from '../src/domain/pauses';
import { generateBlocks } from '../src/domain/planner';
import type { PlannerConfig, StudyBlock, StudyEvent, StudyGroup } from '../src/domain/types';

const cfg: PlannerConfig = { studyWindows: [{ start: '09:00', end: '17:30' }], start: '09:00', end: '17:30', pomo: 25, shortBreak: 5, longBreak: 15 };
const almoco: StudyEvent = { name: '🍽️ Almoço', start: '13:00', end: '14:00', countsAsStudy: false };

describe('pauseRecordFor — o registro arredonda a favor de quem pausou', () => {
  it('começo pra baixo, duração pra cima', () => {
    expect(pauseRecordFor(new Date('2026-09-02T10:10:50'), new Date('2026-09-02T10:11:10'))).toEqual({ at: '10:10', mins: 1 });
    expect(pauseRecordFor(new Date('2026-09-02T10:10:00'), new Date('2026-09-02T10:17:01'))).toEqual({ at: '10:10', mins: 8 });
    expect(pauseRecordFor(new Date('2026-09-02T10:10:00'), new Date('2026-09-02T10:17:00'))).toEqual({ at: '10:10', mins: 7 });
  });

  it('nunca menos de 1 minuto', () => {
    expect(pauseRecordFor(new Date('2026-09-02T10:10:00'), new Date('2026-09-02T10:10:00')).mins).toBe(1);
  });
});

describe('normalizePauses / addPause / pausesTotal', () => {
  it('lê qualquer formato e devolve só registros válidos, em ordem', () => {
    expect(normalizePauses(undefined)).toEqual({});
    expect(normalizePauses('x')).toEqual({});
    expect(normalizePauses({ '2026-09-02': [{ at: '10:30', mins: 3 }, 'lixo', { at: '9:00', mins: 2 }, { at: '10:00', mins: 0 }, { at: '09:10', mins: 1.5 }, { at: '09:05', mins: 7 }] })).toEqual({
      '2026-09-02': [{ at: '09:05', mins: 7 }, { at: '10:30', mins: 3 }],
    });
    expect(normalizePauses({ '2026-09-02': [] })).toEqual({});
  });

  it('addPause mantém a ordem; pausesTotal soma', () => {
    const day = addPause(addPause(undefined, { at: '10:30', mins: 3 }), { at: '09:05', mins: 7 });
    expect(day).toEqual([{ at: '09:05', mins: 7 }, { at: '10:30', mins: 3 }]);
    expect(pausesTotal(day)).toEqual({ count: 2, mins: 10 });
    expect(pausesTotal(undefined)).toEqual({ count: 0, mins: 0 });
  });
});

describe('a pausa aberta no dispositivo', () => {
  const block: StudyBlock = { time: '10:00', endTime: '10:25', name: '📖 Estudo 3', type: 'estudo', xp: 50, cycle: 0 };

  it('ida e volta, com o que o timer precisa pra voltar', () => {
    const s = pauseSessionFor(block, '2026-09-02', 123456);
    expect(parsePauseSession(JSON.parse(JSON.stringify(s)))).toEqual({ dateKey: '2026-09-02', block: { ...block }, pausedAt: 123456 });
    expect(parsePauseSession(pauseSessionFor({ ...block, paused: 4 }, '2026-09-02', 1))!.block.paused).toBe(4);
  });

  it('recusa lixo', () => {
    expect(parsePauseSession(null)).toBeNull();
    expect(parsePauseSession({ dateKey: '2026-09-02' })).toBeNull();
    expect(parsePauseSession({ dateKey: 'hoje', block, pausedAt: 1 })).toBeNull();
    expect(parsePauseSession({ dateKey: '2026-09-02', block: { ...block, type: 'event' }, pausedAt: 1 })).toBeNull();
    expect(parsePauseSession({ dateKey: '2026-09-02', block, pausedAt: 'x' })).toBeNull();
  });
});

describe('pauseRemap — quem é quem depois da pausa', () => {
  const before = generateBlocks(cfg, [almoco]);

  it('acha o bloco que contém o minuto', () => {
    expect(blockAt(before, '10:10')).toMatchObject({ time: '10:00', type: 'estudo' });
    expect(blockAt(before, '10:27')).toMatchObject({ time: '10:25', type: 'pausa' });
    expect(blockAt(before, '13:30')).toBeNull(); // almoço
    expect(blockAt(before, '18:00')).toBeNull();
  });

  it('a cadeia depois do bloco pausado desliza; o que vem depois do almoço não entra', () => {
    const after = generateBlocks(cfg, [almoco], [{ at: '10:10', mins: 7 }]);
    const pairs = pauseRemap(before, after, '10:10')!;
    expect(pairs[0]).toMatchObject({ before: { time: '10:00', endTime: '10:25' }, after: { time: '10:00', endTime: '10:32', paused: 7 } });
    expect(pairs[1]).toMatchObject({ before: { time: '10:25', type: 'pausa' }, after: { time: '10:32', type: 'pausa' } });
    expect(pairs[2]).toMatchObject({ before: { time: '10:30' }, after: { time: '10:37' } });
    // A cadeia acaba no almoço: nenhum par tem bloco da tarde.
    expect(pairs.every((p) => p.before.time < '13:00')).toBe(true);
    expect(pairs.some((p) => p.before.time === '14:00')).toBe(false);
  });

  it('bloco que sumiu (cortado contra o almoço) vira null', () => {
    const after = generateBlocks(cfg, [almoco], [{ at: '10:10', mins: 20 }]);
    const pairs = pauseRemap(before, after, '10:10')!;
    const ultimo = pairs[pairs.length - 1]!;
    expect(ultimo.before.time < '13:00').toBe(true);
    expect(pairs.filter((p) => p.after === null).length).toBeGreaterThan(0);
  });

  it('minuto fora de qualquer estudo/pausa: null', () => {
    expect(pauseRemap(before, before, '13:30')).toBeNull();
  });
});

describe('remapChecksForPause / remapGroupsForPause', () => {
  const before = generateBlocks(cfg, [almoco]);
  const after = generateBlocks(cfg, [almoco], [{ at: '10:10', mins: 7 }]);
  const pairs = pauseRemap(before, after, '10:10')!;

  it('checks anteriores ficam; no bloco pausado ficam (o início não muda); nos posteriores seguem o bloco', () => {
    const day = { '09:00': { pet: 'cat', bonus: 0 }, '10:00': { pet: 'cat', bonus: 0.05 }, '10:30': { pet: null, bonus: 0 }, '14:00': true as const };
    const r = remapChecksForPause(day, pairs);
    expect(r.dropped).toBe(0);
    expect(r.checks).toEqual({ '09:00': { pet: 'cat', bonus: 0 }, '10:00': { pet: 'cat', bonus: 0.05 }, '10:37': { pet: null, bonus: 0 }, '14:00': true });
  });

  it('check de bloco que sumiu é descartado e contado', () => {
    const afterBig = generateBlocks(cfg, [almoco], [{ at: '10:10', mins: 20 }]);
    const p = pauseRemap(before, afterBig, '10:10')!;
    const sumiu = p.find((x) => x.after === null)!.before;
    const r = remapChecksForPause({ [sumiu.time]: { pet: null, bonus: 0 } }, p);
    expect(r.dropped).toBe(1);
    expect(r.checks).toEqual({});
  });

  it('deslocamento de um ciclo inteiro não troca os checks de lugar', () => {
    // 30 min = estudo + pausa: o Estudo 4 (10:30) cai exatamente onde ficava a pausa longa (11:00) — e o Estudo 5
    // (11:10) vai pra 11:40. Por posição, cada check segue o SEU bloco, não o horário que ficou vago.
    const after30 = generateBlocks(cfg, [almoco], [{ at: '10:10', mins: 30 }]);
    expect(after30.filter((b) => b.time >= '10:00' && b.time < '12:00').map((b) => `${b.time} ${b.type}`)).toEqual([
      '10:00 estudo', '10:55 pausa', '11:00 estudo', '11:25 pausa', '11:40 estudo',
    ]);
    const p = pauseRemap(before, after30, '10:10')!;
    const r = remapChecksForPause({ '10:30': { pet: 'a', bonus: 0 }, '11:10': { pet: 'b', bonus: 0 } }, p);
    expect(r.checks['11:00']).toEqual({ pet: 'a', bonus: 0 });
    expect(r.checks['11:40']).toEqual({ pet: 'b', bonus: 0 });
    expect(r.checks['10:30']).toBeUndefined();
  });

  it('grupos: o que contém o bloco pausado estica o fim; o posterior desliza inteiro; o da tarde não se move', () => {
    const g = (id: string, start: string, end: string): StudyGroup => ({ id, start, end, name: id, goal: '' });
    // Antes: E3 10:00–10:25, pausa, E4 10:30–10:55, pausa longa 10:55–11:10, E5 11:10–11:35. Com 7 min: tudo +7.
    const groups = [g('a', '09:00', '10:25'), g('b', '10:30', '11:35'), g('c', '14:00', '15:00')];
    expect(remapGroupsForPause(groups, pairs)).toEqual([g('a', '09:00', '10:32'), g('b', '10:37', '11:42'), g('c', '14:00', '15:00')]);
  });

  it('grupo que terminava num bloco cortado termina no último que ficou', () => {
    const afterBig = generateBlocks(cfg, [almoco], [{ at: '10:10', mins: 20 }]);
    const p = pauseRemap(before, afterBig, '10:10')!;
    const last = p[p.length - 1]!.before; // o último da cadeia de antes (sumiu ou foi cortado)
    const kept = [...p].reverse().find((x) => x.after)!.after!;
    const [g] = remapGroupsForPause([{ id: 'x', start: '10:00', end: last.endTime, name: 'x', goal: '' }], p);
    expect(g!.end).toBe(kept.endTime);
  });
});

describe('higiene: a duração de um bloco é sempre blockMins', () => {
  // Um `endTime - time` solto ignora o tempo pausado e infla XP, moedas ou meta. Só `domain/time.ts` faz a conta.
  it('nenhum arquivo em src/ subtrai endTime de time por conta própria', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !p.replace(/\\/g, '/').endsWith('domain/time.ts')) {
          const src = readFileSync(p, 'utf8');
          if (/timeToMins\((\w+)\.endTime\)\s*-\s*timeToMins\(\1\.time\)/.test(src)) offenders.push(p);
        }
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
  });
});
