// A folha do bloco (src/domain/blockSheet.ts): os fatos de um bloco, de uma vez.

import { describe, expect, it } from 'vitest';
import { blockFacts } from '../src/domain/blockSheet';
import type { StudyBlock, StudyGroup } from '../src/domain/types';

const estudo: StudyBlock = { time: '10:00', endTime: '10:25', name: '📖 Estudo 3', type: 'estudo', xp: 50, cycle: 0 };
const pausa: StudyBlock = { time: '10:55', endTime: '11:15', name: '☕ Pausa longa', type: 'pausa', xp: 20, cycle: 1 };
const aula: StudyBlock = { time: '14:00', endTime: '15:30', name: '📅 Aula', type: 'event', xp: 180, cycle: 2 };
const grupo: StudyGroup = { id: 'g1', start: '09:00', end: '10:25', name: 'Análise II', goal: 'lista 3' };

describe('blockFacts', () => {
  it('estudo sem check: o que entra ao concluir, sem bônus, com o grupo a que pertence', () => {
    expect(blockFacts(estudo, undefined, [grupo])).toEqual({
      start: '10:00',
      end: '10:25',
      mins: 25,
      paused: 0,
      cycle: 0,
      checked: false,
      xp: 50,
      coins: 25,
      bonusPct: null,
      group: grupo,
    });
  });

  it('estudo marcado com bônus de skill: o XP que ENTROU, e o bônus em % inteiro', () => {
    const f = blockFacts(estudo, { pet: 'cat', bonus: 0.05 }, []);
    expect(f.checked).toBe(true);
    expect(f.xp).toBe(53); // round(50 × 1.05)
    expect(f.bonusPct).toBe(5);
    expect(f.group).toBeNull();
  });

  it('check antigo (`true`) conta como marcado, sem bônus', () => {
    const f = blockFacts(estudo, true, []);
    expect(f.checked).toBe(true);
    expect(f.xp).toBe(50);
    expect(f.bonusPct).toBeNull();
  });

  it('pausa: XP sim, moeda não; e o tempo pausado do timer sai da duração que vale', () => {
    const f = blockFacts({ ...pausa, endTime: '11:22', paused: 7 }, undefined, []);
    expect(f.mins).toBe(20);
    expect(f.paused).toBe(7);
    expect(f.xp).toBe(20);
    expect(f.coins).toBe(0);
    expect(f.cycle).toBe(1);
  });

  it('evento que conta como estudo rende moeda pela duração real', () => {
    const f = blockFacts(aula, undefined, []);
    expect(f.mins).toBe(90);
    expect(f.coins).toBe(90);
    expect(f.xp).toBe(180);
  });

  it('bloco fora de qualquer grupo, e bloqueio sem ciclo', () => {
    const almoco: StudyBlock = { time: '13:00', endTime: '14:00', name: '🍽️ Almoço', type: 'intervalo', xp: 0 };
    const f = blockFacts(almoco, undefined, [grupo]);
    expect(f.group).toBeNull();
    expect(f.cycle).toBeNull();
    expect(f.coins).toBe(0);
  });
});
