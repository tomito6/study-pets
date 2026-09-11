import { describe, expect, it } from 'vitest';
import { abandonNotice, creditedDaysNotices, isStreakMilestone, petNotices } from '../src/domain/progressNotices';
import type { CreditContext, CreditedDay, PetProgress } from '../src/domain/progressNotices';

const pet = (over: Partial<PetProgress> = {}): PetProgress => ({ id: 'dog', name: 'Bolt', level: 3, canEvolve: false, ...over });

describe('petNotices', () => {
  it('pet que subiu de nível vira uma linha, com o nível novo no id', () => {
    const out = petNotices([pet({ level: 4 })], [pet({ level: 5 })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('pet-nivel:dog:5');
    expect(out[0]!.data).toEqual({ nome: 'Bolt', n: 5 });
  });

  it('pet parado não vira linha nenhuma', () => {
    expect(petNotices([pet()], [pet()])).toEqual([]);
  });

  it('evolução destravada vira linha própria, e entra DEPOIS do nível (fica por cima na lista)', () => {
    const out = petNotices([pet({ level: 4, canEvolve: false })], [pet({ level: 5, canEvolve: true })]);
    expect(out.map((n) => n.kind)).toEqual(['pet-nivel', 'pet-evolucao']);
  });

  it('evolução que já estava disponível antes não vira linha de novo', () => {
    const out = petNotices([pet({ canEvolve: true })], [pet({ canEvolve: true })]);
    expect(out).toEqual([]);
  });

  it('pet adotado agora (não existia antes) não "subiu" de nada', () => {
    expect(petNotices([], [pet({ level: 1 })])).toEqual([]);
  });

  it('pet que perdeu XP (penalidade do hardcore) não vira linha', () => {
    expect(petNotices([pet({ level: 5 })], [pet({ level: 3 })])).toEqual([]);
  });

  it('dois pets avançam: duas linhas, uma por pet', () => {
    const antes = [pet({ id: 'dog', level: 1 }), pet({ id: 'cat', name: 'Nina', level: 1 })];
    const depois = [pet({ id: 'dog', level: 2 }), pet({ id: 'cat', name: 'Nina', level: 2 })];
    expect(petNotices(antes, depois).map((n) => n.id)).toEqual(['pet-nivel:dog:2', 'pet-nivel:cat:2']);
  });
});

describe('isStreakMilestone', () => {
  it('os degraus que rendem bônus são marcos — menos o de 1 dia', () => {
    expect(isStreakMilestone(1)).toBe(false);
    expect(isStreakMilestone(3)).toBe(true);
    expect(isStreakMilestone(7)).toBe(true);
    expect(isStreakMilestone(14)).toBe(true);
    expect(isStreakMilestone(30)).toBe(true);
  });
  it('dia comum não é marco', () => {
    expect(isStreakMilestone(2)).toBe(false);
    expect(isStreakMilestone(8)).toBe(false);
    expect(isStreakMilestone(31)).toBe(false);
  });
  it('depois do último degrau, a cada 30 dias', () => {
    expect(isStreakMilestone(60)).toBe(true);
    expect(isStreakMilestone(90)).toBe(true);
    expect(isStreakMilestone(45)).toBe(false);
  });
  it('sequência zerada não é marco', () => {
    expect(isStreakMilestone(0)).toBe(false);
  });
});

describe('creditedDaysNotices', () => {
  // Contexto neutro de propósito: nenhum nível cruzado (2680 e 3000 são o mesmo
  // nível), nenhum recorde (400 > 320) e nenhum cruzamento de saldo (240 e 400
  // estão os dois acima de 150). Cada teste liga UMA dessas coisas.
  const ctx = (over: Partial<CreditContext> = {}): CreditContext => ({
    totalXP: 3000,
    bestDayXPBefore: 400,
    balanceAfter: 400,
    cheapestPet: 150,
    ...over,
  });
  const dia = (over: Partial<CreditedDay> = {}): CreditedDay => ({ dia: '2026-09-11', xp: 320, coins: 160, streak: 2, ...over });

  it('dia sem ganho nenhum não deixa linha — encerrar um dia em branco não é notícia', () => {
    expect(creditedDaysNotices([dia({ xp: 0, coins: 0 })], ctx())).toEqual([]);
    expect(creditedDaysNotices([], ctx())).toEqual([]);
  });

  it('dia com ganho deixa a linha do dia, com XP e moedas', () => {
    const out = creditedDaysNotices([dia()], ctx());
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('dia:2026-09-11');
    expect(out[0]!.data).toEqual({ dia: '2026-09-11', xp: 320, coins: 160 });
  });

  it('subir de nível entra por último, pra ficar por cima na lista', () => {
    // 320 XP de ganho num total de 800: antes eram 480 (nível 2), agora é o 3.
    const out = creditedDaysNotices([dia()], ctx({ totalXP: 800 }));
    expect(out[out.length - 1]!.id).toBe('nivel:3');
    expect(out[out.length - 1]!.data).toEqual({ n: 3, nome: 'Focado' });
  });

  it('dois níveis num lote só viram UMA linha, do nível alcançado', () => {
    const dois = [dia({ dia: '2026-09-10', xp: 800, coins: 0 }), dia({ dia: '2026-09-11', xp: 800, coins: 0 })];
    const out = creditedDaysNotices(dois, ctx({ totalXP: 1600 }));
    const niveis = out.filter((n) => n.kind === 'nivel');
    expect(niveis).toHaveLength(1);
    expect(niveis[0]!.data!.n).toBe(4); // 1600 XP
  });

  it('recorde só quando bate um dia anterior de verdade', () => {
    expect(creditedDaysNotices([dia({ xp: 520 })], ctx({ bestDayXPBefore: 400 })).some((n) => n.kind === 'recorde-dia')).toBe(true);
    expect(creditedDaysNotices([dia()], ctx({ bestDayXPBefore: 0 })).some((n) => n.kind === 'recorde-dia')).toBe(false);
    expect(creditedDaysNotices([dia({ xp: 100 })], ctx({ bestDayXPBefore: 400 })).some((n) => n.kind === 'recorde-dia')).toBe(false);
  });

  it('dentro do lote, o recorde é contra o melhor dia do próprio lote também', () => {
    const dois = [dia({ dia: '2026-09-10', xp: 500 }), dia({ dia: '2026-09-11', xp: 450 })];
    const ids = creditedDaysNotices(dois, ctx({ bestDayXPBefore: 100, totalXP: 950 })).filter((n) => n.kind === 'recorde-dia').map((n) => n.id);
    expect(ids).toEqual(['recorde-dia:2026-09-10']); // o segundo dia não bate o primeiro
  });

  it('moedas só quando o saldo CRUZA o preço do pet mais barato', () => {
    expect(creditedDaysNotices([dia({ coins: 160 })], ctx({ balanceAfter: 300 })).some((n) => n.kind === 'moedas')).toBe(true);
    // já dava pra comprar antes: nada de lembrete diário pra gastar
    expect(creditedDaysNotices([dia({ coins: 160 })], ctx({ balanceAfter: 460 })).some((n) => n.kind === 'moedas')).toBe(false);
    expect(creditedDaysNotices([dia({ coins: 40 })], ctx({ balanceAfter: 90 })).some((n) => n.kind === 'moedas')).toBe(false);
  });

  it('marco de sequência entra com o bônus por dia, e o id carrega o dia (a sequência pode ser refeita)', () => {
    const seq = creditedDaysNotices([dia({ streak: 7 })], ctx()).find((n) => n.kind === 'sequencia')!;
    expect(seq.id).toBe('sequencia:2026-09-11:7');
    expect(seq.data).toEqual({ dia: '2026-09-11', n: 7, coins: 12 });
  });

  it('sequência fora de marco não vira linha', () => {
    expect(creditedDaysNotices([dia({ streak: 5 })], ctx()).some((n) => n.kind === 'sequencia')).toBe(false);
  });

  it('lote grande: no máximo três linhas de dia, as mais recentes', () => {
    const dias = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'].map((d) => dia({ dia: d, xp: 100, coins: 50 }));
    const out = creditedDaysNotices(dias, ctx({ totalXP: 500, balanceAfter: 250, bestDayXPBefore: 900 }));
    expect(out.filter((n) => n.kind === 'dia').map((n) => n.data!.dia)).toEqual(['2026-09-09', '2026-09-10', '2026-09-11']);
  });

  it('os ids não dependem do relógio: o mesmo lote duas vezes dá os mesmos ids', () => {
    const a = creditedDaysNotices([dia()], ctx());
    const b = creditedDaysNotices([dia()], ctx());
    expect(a.map((n) => n.id)).toEqual(b.map((n) => n.id));
  });
});

describe('abandonNotice', () => {
  it('carrega o bloco, o dia e o que saiu de cada um — e o id é o bloco', () => {
    const n = abandonNotice('2026-09-10', { time: '09:00', name: '📖 Estudo 3' }, { userXp: 100, petXp: 100 }, 'Bolt');
    expect(n.id).toBe('abandono:2026-09-10:09:00');
    expect(n.data).toEqual({ dia: '2026-09-10', nome: 'Estudo 3', xp: 100, pet: 'Bolt', petXp: 100 });
  });

  it('sem pet equipado, a linha fala só de você', () => {
    const n = abandonNotice('2026-09-10', { time: '09:00', name: '📖 Estudo 3' }, { userXp: 100, petXp: 0 }, null);
    expect(n.data!.pet).toBeUndefined();
    expect(n.data!.petXp).toBeUndefined();
  });
});
