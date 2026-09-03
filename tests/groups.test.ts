import { describe, expect, it } from 'vitest';
import {
  blockInGroup,
  groupHeaderPositions,
  groupOf,
  groupProgress,
  rangeOf,
  rangesOverlap,
  sortGroups,
  validateGroupRange,
} from '../src/domain/groups';
import type { BlockType, StudyBlock, StudyGroup } from '../src/domain/types';

const b = (time: string, endTime: string, type: BlockType, session = 0): StudyBlock =>
  ({ time, endTime, name: type, type, xp: 0, session });
const g = (id: string, start: string, end: string): StudyGroup => ({ id, start, end, name: id, goal: '' });

// Manhã com pomo 25/pausa 5, almoço, aula à tarde e mais um estudo.
const blocks: StudyBlock[] = [
  b('09:00', '09:25', 'estudo'),
  b('09:25', '09:30', 'pausa'),
  b('09:30', '09:55', 'estudo'),
  b('09:55', '10:00', 'pausa'),
  b('10:00', '10:25', 'estudo'),
  b('12:00', '13:00', 'almoco'),
  b('13:00', '14:30', 'event', 1),
  b('14:30', '14:55', 'estudo', 1),
];

describe('pertencimento é por horário', () => {
  const manha = g('m', '09:00', '10:25');

  it('bloco que cabe inteiro no intervalo pertence; nas bordas também', () => {
    expect(blockInGroup(blocks[0]!, manha)).toBe(true);
    expect(blockInGroup(blocks[4]!, manha)).toBe(true); // termina exatamente no fim do grupo
    expect(blockInGroup(blocks[1]!, manha)).toBe(true); // pausa também é membro (só não conta)
  });

  it('bloco que vaza do intervalo não pertence', () => {
    expect(blockInGroup(blocks[4]!, g('x', '09:00', '10:10'))).toBe(false);
    expect(blockInGroup(blocks[5]!, manha)).toBe(false);
  });

  it('groupOf acha o grupo do bloco ou devolve null', () => {
    const tarde = g('t', '13:00', '15:00');
    expect(groupOf([manha, tarde], blocks[6]!)?.id).toBe('t');
    expect(groupOf([manha, tarde], blocks[5]!)).toBeNull();
  });
});

describe('progresso', () => {
  it('conta estudos e eventos pela duração real; pausa e almoço não entram', () => {
    const p = groupProgress(g('m', '09:00', '10:25'), blocks, { '09:00': true, '09:30': { pet: null, bonus: 0 } });
    expect(p).toEqual({ done: 2, total: 3, minsDone: 50, minsTotal: 75 });
  });

  it('grupo que atravessa o almoço pega a aula do outro lado', () => {
    const p = groupProgress(g('d', '09:00', '14:30'), blocks, undefined);
    expect(p).toEqual({ done: 0, total: 4, minsDone: 0, minsTotal: 165 });
  });

  it('trecho sem estudo fica zerado', () => {
    expect(groupProgress(g('v', '11:00', '13:00'), blocks, undefined)).toEqual({ done: 0, total: 0, minsDone: 0, minsTotal: 0 });
  });
});

describe('rangeOf', () => {
  it('vai do início mais cedo ao fim mais tarde, em qualquer ordem', () => {
    expect(rangeOf(blocks.slice(0, 3))).toEqual({ start: '09:00', end: '09:55' });
    expect(rangeOf([blocks[4]!, blocks[0]!])).toEqual({ start: '09:00', end: '10:25' });
  });

  it('vazio é null', () => {
    expect(rangeOf([])).toBeNull();
  });
});

describe('validação', () => {
  const existing = [g('m', '09:00', '10:00')];

  it('fim antes do início', () => {
    expect(validateGroupRange({ start: '10:00', end: '10:00' }, [], blocks)).toEqual({ ok: false, reason: 'end-before-start' });
  });

  it('sobreposição com outro grupo do dia — encostar não é sobrepor', () => {
    expect(validateGroupRange({ start: '09:30', end: '10:25' }, existing, blocks)).toEqual({ ok: false, reason: 'overlap' });
    expect(validateGroupRange({ start: '10:00', end: '10:25' }, existing, blocks)).toEqual({ ok: true });
    expect(rangesOverlap({ start: '09:00', end: '10:00' }, { start: '10:00', end: '11:00' })).toBe(false);
  });

  it('ao editar, o próprio grupo não conta como sobreposição', () => {
    expect(validateGroupRange({ start: '09:00', end: '10:25' }, existing, blocks, 'm')).toEqual({ ok: true });
  });

  it('precisa de pelo menos um estudo ou evento dentro', () => {
    expect(validateGroupRange({ start: '09:25', end: '09:30' }, [], blocks)).toEqual({ ok: false, reason: 'no-study' });
    expect(validateGroupRange({ start: '12:00', end: '13:00' }, [], blocks)).toEqual({ ok: false, reason: 'no-study' });
    expect(validateGroupRange({ start: '13:00', end: '14:30' }, [], blocks)).toEqual({ ok: true }); // evento vale
  });

  it('sobreposição pesa mais que falta de estudo (é o motivo mais útil)', () => {
    expect(validateGroupRange({ start: '09:25', end: '09:30' }, existing, blocks)).toEqual({ ok: false, reason: 'overlap' });
  });
});

describe('posição dos cabeçalhos', () => {
  it('antes do primeiro bloco membro, com a sessão dele', () => {
    const pos = groupHeaderPositions([g('t', '13:00', '15:00'), g('m', '09:30', '10:25')], blocks);
    expect(pos.map((p) => [p.group.id, p.index, p.session])).toEqual([['m', 2, 0], ['t', 6, 1]]);
    expect(pos.every((p) => !p.empty)).toBe(true);
  });

  it('sem membro, antes do primeiro bloco que começa no horário do grupo ou depois', () => {
    const pos = groupHeaderPositions([g('v', '11:00', '11:45')], blocks);
    expect(pos[0]).toMatchObject({ index: 5, session: undefined, empty: true });
  });

  it('depois de todos os blocos, quando o trecho fica no fim do dia', () => {
    expect(groupHeaderPositions([g('n', '20:00', '21:00')], blocks)[0]!.index).toBe(blocks.length);
  });
});

it('sortGroups ordena por início sem mexer no original', () => {
  const list = [g('b', '14:00', '15:00'), g('a', '09:00', '10:00')];
  expect(sortGroups(list).map((x) => x.id)).toEqual(['a', 'b']);
  expect(list[0]!.id).toBe('b');
});
