import { describe, expect, it } from 'vitest';
import {
  MAX_NOTIFICATIONS,
  addNotifications,
  ageOf,
  hasUnread,
  markAllRead,
  normalizeNotifications,
  unreadCount,
} from '../src/domain/notifications';
import type { Notification } from '../src/domain/notifications';

const T0 = new Date('2026-09-11T10:00:00').getTime();

const nova = (id: string, kind: Notification['kind'] = 'dia') => ({ id, kind });

describe('addNotifications', () => {
  it('põe a mais nova primeiro', () => {
    const l1 = addNotifications([], [nova('a')], T0);
    const l2 = addNotifications(l1, [nova('b')], T0 + 1000);
    expect(l2.map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('mantém a ordem de emissão dentro do mesmo lote (a última emitida fica no topo)', () => {
    const l = addNotifications([], [nova('a'), nova('b'), nova('c')], T0);
    expect(l.map((n) => n.id)).toEqual(['c', 'b', 'a']);
  });

  it('id repetido não duplica — e a linha antiga vence, com o read dela', () => {
    const l1 = markAllRead(addNotifications([], [nova('nivel:4')], T0));
    const l2 = addNotifications(l1, [nova('nivel:4')], T0 + 86_400_000);
    expect(l2).toHaveLength(1);
    expect(l2[0]!.read).toBe(true);
    expect(l2[0]!.at).toBe(T0); // o carimbo original fica
  });

  it('id repetido DENTRO do mesmo lote também entra uma vez só', () => {
    const l = addNotifications([], [nova('x'), nova('x')], T0);
    expect(l).toHaveLength(1);
  });

  it('id vazio é ignorado', () => {
    expect(addNotifications([], [nova('')], T0)).toHaveLength(0);
  });

  it('respeita o teto, cortando as mais velhas', () => {
    let l: Notification[] = [];
    for (let i = 0; i < MAX_NOTIFICATIONS + 5; i++) l = addNotifications(l, [nova(`n${i}`)], T0 + i);
    expect(l).toHaveLength(MAX_NOTIFICATIONS);
    expect(l[0]!.id).toBe(`n${MAX_NOTIFICATIONS + 4}`);
    expect(l.some((n) => n.id === 'n0')).toBe(false);
  });

  it('lote vazio devolve a lista como está (mas já no teto)', () => {
    const l = addNotifications([], [nova('a')], T0);
    expect(addNotifications(l, [], T0)).toEqual(l);
  });
});

describe('lido / não lido', () => {
  it('conta só as não lidas', () => {
    const l = addNotifications([], [nova('a'), nova('b')], T0);
    expect(unreadCount(l)).toBe(2);
    expect(hasUnread(l)).toBe(true);
    const lidas = markAllRead(l);
    expect(unreadCount(lidas)).toBe(0);
    expect(hasUnread(lidas)).toBe(false);
  });

  it('markAllRead devolve a MESMA lista quando nada mudaria', () => {
    const l = markAllRead(addNotifications([], [nova('a')], T0));
    expect(markAllRead(l)).toBe(l);
  });

  it('marcar como lida não apaga nada', () => {
    const l = markAllRead(addNotifications([], [nova('a'), nova('b')], T0));
    expect(l).toHaveLength(2);
  });
});

describe('normalizeNotifications', () => {
  it('campo ausente vira lista vazia', () => {
    expect(normalizeNotifications(undefined)).toEqual([]);
    expect(normalizeNotifications(null)).toEqual([]);
    expect(normalizeNotifications({})).toEqual([]);
  });

  it('joga fora entrada sem id, com kind desconhecido, ou que não é objeto', () => {
    const out = normalizeNotifications([
      { id: 'ok', kind: 'dia', at: T0, read: false },
      { kind: 'dia', at: T0 },
      { id: 'x', kind: 'inventado', at: T0 },
      'lixo',
      null,
    ]);
    expect(out.map((n) => n.id)).toEqual(['ok']);
  });

  it('id repetido no documento entra uma vez só', () => {
    const out = normalizeNotifications([
      { id: 'a', kind: 'dia', at: T0 },
      { id: 'a', kind: 'nivel', at: T0 + 5 },
    ]);
    expect(out).toHaveLength(1);
  });

  it('ordena por data, mais nova primeiro, e aplica o teto', () => {
    const out = normalizeNotifications([
      { id: 'velha', kind: 'dia', at: T0 },
      { id: 'nova', kind: 'dia', at: T0 + 1000 },
    ]);
    expect(out.map((n) => n.id)).toEqual(['nova', 'velha']);
  });

  it('só deixa passar os campos conhecidos de data, com o tipo certo', () => {
    const out = normalizeNotifications([
      { id: 'a', kind: 'pet-nivel', at: T0, read: true, data: { n: 5, nome: 'Bolt', xp: 'x', coins: NaN, dia: '2026-09-10', lixo: 1 } },
    ]);
    expect(out[0]!.data).toEqual({ n: 5, nome: 'Bolt', dia: '2026-09-10' });
    expect(out[0]!.read).toBe(true);
  });

  it('at ausente ou torto vira 0, sem quebrar a ordenação', () => {
    const out = normalizeNotifications([{ id: 'a', kind: 'dia' }]);
    expect(out[0]!.at).toBe(0);
  });
});

describe('ageOf', () => {
  it('menos de um minuto é "agora"', () => {
    expect(ageOf(T0, T0 + 59_000)).toEqual({ unit: 'agora' });
  });
  it('minutos, horas, ontem e dias', () => {
    expect(ageOf(T0, T0 + 5 * 60_000)).toEqual({ unit: 'min', n: 5 });
    expect(ageOf(T0, T0 + 3 * 3_600_000)).toEqual({ unit: 'h', n: 3 });
    expect(ageOf(T0, T0 + 30 * 3_600_000)).toEqual({ unit: 'ontem' });
    expect(ageOf(T0, T0 + 3 * 24 * 3_600_000)).toEqual({ unit: 'd', n: 3 });
  });
  it('carimbo no futuro (relógio do outro dispositivo adiantado) lê como agora', () => {
    expect(ageOf(T0 + 60_000, T0)).toEqual({ unit: 'agora' });
  });
});
