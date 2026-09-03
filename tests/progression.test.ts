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
  skillEligible,
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

describe('skills: elegibilidade decidida no momento do check', () => {
  const HOJE = '2026-09-02';
  // "Agora" fixo às 19h, pra o teste não depender do relógio real.
  const agora = new Date('2026-09-02T19:00:00');

  const ctx = (over: Partial<SkillContext> = {}): SkillContext => ({
    activeSkill: 'noturno',
    activatedAt: new Date('2026-09-02T08:00:00').getTime(),
    studiesCheckedToday: 0,
    now: agora,
    ...over,
  });

  const blocoNoturno = { type: 'estudo' as const, time: '18:30' };
  const blocoManha = { type: 'estudo' as const, time: '09:00' };

  it('Noturno vale pra estudo a partir das 18h', () => {
    expect(skillEligible(blocoNoturno, HOJE, ctx())).toBe(true);
    expect(skillEligible({ type: 'estudo', time: '17:59' }, HOJE, ctx())).toBe(false);
    expect(skillEligible({ type: 'pausa', time: '19:00' }, HOJE, ctx())).toBe(false);
  });

  it('Lua cheia só a partir das 21h', () => {
    expect(skillEligible(blocoNoturno, HOJE, ctx({ activeSkill: 'lua-cheia' }))).toBe(false);
    expect(skillEligible({ type: 'estudo', time: '21:00' }, HOJE, ctx({ activeSkill: 'lua-cheia', now: new Date('2026-09-02T21:30:00') }))).toBe(true);
  });

  it('Fiel vale só pro primeiro estudo marcado no dia', () => {
    expect(skillEligible(blocoManha, HOJE, ctx({ activeSkill: 'fiel' }))).toBe(true);
    expect(skillEligible(blocoManha, HOJE, ctx({ activeSkill: 'fiel', studiesCheckedToday: 1 }))).toBe(false);
    expect(skillEligible({ type: 'event', time: '09:00' }, HOJE, ctx({ activeSkill: 'fiel' }))).toBe(false);
  });

  it('Aula vale só pra evento que conta como estudo', () => {
    expect(skillEligible({ type: 'event', time: '10:00' }, HOJE, ctx({ activeSkill: 'aula' }))).toBe(true);
    expect(skillEligible(blocoManha, HOJE, ctx({ activeSkill: 'aula' }))).toBe(false);
  });

  it('sem skill, skill desconhecida ou placeholder: nada', () => {
    expect(skillEligible(blocoNoturno, HOJE, ctx({ activeSkill: null }))).toBe(false);
    expect(skillEligible(blocoNoturno, HOJE, ctx({ activeSkill: 'xyz' }))).toBe(false);
    expect(skillEligible(blocoNoturno, HOJE, ctx({ activeSkill: 'voo' }))).toBe(false);
  });

  it('não vale em outro dia que não hoje', () => {
    expect(skillEligible(blocoNoturno, '2026-09-01', ctx())).toBe(false);
  });

  it('não vale se a skill (ou o pet) foi ativada depois do bloco começar (anti-exploit)', () => {
    const depois = new Date('2026-09-02T18:45:00').getTime();
    expect(skillEligible(blocoNoturno, HOJE, ctx({ activatedAt: depois }))).toBe(false);
    const antes = new Date('2026-09-02T18:00:00').getTime();
    expect(skillEligible(blocoNoturno, HOJE, ctx({ activatedAt: antes }))).toBe(true);
  });

  it('bonusForCheck traduz elegibilidade em 0.05 ou 0', () => {
    expect(bonusForCheck(blocoNoturno, HOJE, ctx())).toBe(0.05);
    expect(bonusForCheck(blocoNoturno, HOJE, ctx({ activeSkill: null }))).toBe(0);
  });
});
