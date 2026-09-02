import { describe, expect, it } from 'vitest';
import {
  bonusForCheck,
  calcXP,
  checkPetOf,
  coinsForBlock,
  dailyBonusForStreak,
  getLevel,
  getLevelIdx,
  getLevelPct,
  noturnoBonusEligible,
  xpFromCheck,
} from '../src/domain/progression';
import type { SkillContext } from '../src/domain/progression';
import type { StudyBlock } from '../src/domain/types';

describe('XP', () => {
  it('rende 2 XP por minuto', () => {
    expect(calcXP(25)).toBe(50);
    expect(calcXP(60)).toBe(120);
    expect(calcXP(0)).toBe(0);
  });
});

describe('Moedas', () => {
  const bloco = (type: StudyBlock['type']) => ({ type });

  it('rende 1 moeda por minuto em estudo e evento', () => {
    expect(coinsForBlock(bloco('estudo'), 25)).toBe(25);
    expect(coinsForBlock(bloco('event'), 90)).toBe(90);
  });

  it('não rende moeda em pausa, almoço ou intervalo', () => {
    expect(coinsForBlock(bloco('pausa'), 20)).toBe(0);
    expect(coinsForBlock(bloco('almoco'), 60)).toBe(0);
    expect(coinsForBlock(bloco('intervalo'), 60)).toBe(0);
  });
});

describe('Bônus diário por streak', () => {
  it('não dá bônus com streak zerado', () => {
    expect(dailyBonusForStreak(0)).toBe(0);
  });

  it('segue as faixas 1/3/7/14/30', () => {
    expect(dailyBonusForStreak(1)).toBe(5);
    expect(dailyBonusForStreak(2)).toBe(5);
    expect(dailyBonusForStreak(3)).toBe(8);
    expect(dailyBonusForStreak(7)).toBe(12);
    expect(dailyBonusForStreak(14)).toBe(18);
    expect(dailyBonusForStreak(30)).toBe(25);
  });

  it('mantém a faixa máxima acima de 30 dias', () => {
    expect(dailyBonusForStreak(365)).toBe(25);
  });
});

describe('Níveis', () => {
  it('nomeia o nível pelo XP acumulado', () => {
    expect(getLevel(0)).toBe('Zero');
    expect(getLevel(249)).toBe('Zero');
    expect(getLevel(250)).toBe('Iniciante');
    expect(getLevel(10000)).toBe('Mestre');
    expect(getLevel(999999)).toBe('Mestre');
  });

  it('dá o índice do nível', () => {
    expect(getLevelIdx(0)).toBe(0);
    expect(getLevelIdx(250)).toBe(1);
    expect(getLevelIdx(10000)).toBe(7);
  });

  it('calcula o progresso dentro do nível', () => {
    expect(getLevelPct(0)).toBe(0);
    expect(getLevelPct(125)).toBe(50);
    expect(getLevelPct(250)).toBe(0);
  });

  it('marca 100% no último nível', () => {
    expect(getLevelPct(10000)).toBe(100);
    expect(getLevelPct(50000)).toBe(100);
  });
});

describe('XP efetivo do check', () => {
  const b = { xp: 100 };

  it('sem check, vale o XP base', () => {
    expect(xpFromCheck(b, null)).toBe(100);
    expect(xpFromCheck(b, undefined)).toBe(100);
  });

  it('check antigo salvo como `true` vale o XP base (retrocompat)', () => {
    expect(xpFromCheck(b, true)).toBe(100);
  });

  it('check sem bônus vale o XP base', () => {
    expect(xpFromCheck(b, { pet: 'cat', bonus: 0 })).toBe(100);
  });

  it('aplica o bônus salvo no check', () => {
    expect(xpFromCheck(b, { pet: 'owl', bonus: 0.05 })).toBe(105);
  });

  it('arredonda o resultado', () => {
    expect(xpFromCheck({ xp: 51 }, { pet: 'owl', bonus: 0.05 })).toBe(54);
  });
});

describe('Pet associado ao check', () => {
  it('checks antigos (`true`) não têm pet', () => {
    expect(checkPetOf(true)).toBeNull();
  });

  it('devolve o pet salvo', () => {
    expect(checkPetOf({ pet: 'owl', bonus: 0 })).toBe('owl');
  });

  it('devolve null quando o check foi feito sem pet equipado', () => {
    expect(checkPetOf({ pet: null, bonus: 0 })).toBeNull();
    expect(checkPetOf(null)).toBeNull();
  });
});

describe('Skill Noturno da coruja', () => {
  const HOJE = '2026-09-02';
  // "Agora" fixo às 19h, pra o teste não depender do relógio real.
  const agora = new Date('2026-09-02T19:00:00');

  const ctx = (over: Partial<SkillContext> = {}): SkillContext => ({
    activePet: 'owl',
    owlSkill: 'noturno',
    activatedAt: new Date('2026-09-02T08:00:00').getTime(),
    now: agora,
    ...over,
  });

  const blocoNoturno = { type: 'estudo' as const, time: '18:30' };

  it('vale pra estudo depois das 18h com a coruja e a skill ativas', () => {
    expect(noturnoBonusEligible(blocoNoturno, HOJE, ctx())).toBe(true);
  });

  it('não vale antes das 18h', () => {
    expect(noturnoBonusEligible({ type: 'estudo', time: '17:59' }, HOJE, ctx())).toBe(false);
  });

  it('não vale em pausa', () => {
    expect(noturnoBonusEligible({ type: 'pausa', time: '19:00' }, HOJE, ctx())).toBe(false);
  });

  it('não vale sem a coruja equipada', () => {
    expect(noturnoBonusEligible(blocoNoturno, HOJE, ctx({ activePet: 'cat' }))).toBe(false);
    expect(noturnoBonusEligible(blocoNoturno, HOJE, ctx({ activePet: null }))).toBe(false);
  });

  it('não vale com outra skill ativa', () => {
    expect(noturnoBonusEligible(blocoNoturno, HOJE, ctx({ owlSkill: 'voo' }))).toBe(false);
    expect(noturnoBonusEligible(blocoNoturno, HOJE, ctx({ owlSkill: null }))).toBe(false);
  });

  it('não vale em outro dia que não hoje', () => {
    expect(noturnoBonusEligible(blocoNoturno, '2026-09-01', ctx())).toBe(false);
  });

  it('não vale se a skill foi ativada depois do bloco começar (anti-exploit)', () => {
    const depois = new Date('2026-09-02T18:45:00').getTime();
    expect(noturnoBonusEligible(blocoNoturno, HOJE, ctx({ activatedAt: depois }))).toBe(false);
  });

  it('vale se a skill já estava ativa antes do bloco começar', () => {
    const antes = new Date('2026-09-02T18:00:00').getTime();
    expect(noturnoBonusEligible(blocoNoturno, HOJE, ctx({ activatedAt: antes }))).toBe(true);
  });

  it('bonusForCheck traduz elegibilidade em 0.05 ou 0', () => {
    expect(bonusForCheck(blocoNoturno, HOJE, ctx())).toBe(0.05);
    expect(bonusForCheck(blocoNoturno, HOJE, ctx({ activePet: 'cat' }))).toBe(0);
  });
});
