import { describe, expect, it } from 'vitest';
import type { DaySummary } from '../src/domain/daySummary';
import { abandonNotice, dayCloseNotices, isStreakMilestone, petNotices } from '../src/domain/progressNotices';
import type { DayCloseFacts, PetProgress } from '../src/domain/progressNotices';

const pet = (over: Partial<PetProgress> = {}): PetProgress => ({ id: 'dog', name: 'Bolt', level: 3, canEvolve: false, ...over });

const resumo = (over: Partial<DaySummary> = {}): DaySummary => ({
  userXP: 320,
  userCoins: 160,
  userLevelUp: false,
  newLevel: 3,
  newLevelName: 'Focado',
  pets: [],
  empty: false,
  ...over,
});

const fatos = (over: Partial<DayCloseFacts> = {}): DayCloseFacts => ({
  dia: '2026-09-11',
  summary: resumo(),
  streak: 2,
  bestDayXPBefore: 400,
  bestDayXPAfter: 400,
  balanceBefore: 40,
  balanceAfter: 60,
  cheapestPet: 150,
  ...over,
});

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

describe('dayCloseNotices', () => {
  it('dia sem nada marcado não deixa linha nenhuma', () => {
    expect(dayCloseNotices(fatos({ summary: resumo({ empty: true }) }))).toEqual([]);
  });

  it('dia com ganho deixa a linha do dia, com XP e moedas', () => {
    const out = dayCloseNotices(fatos());
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('dia:2026-09-11');
    expect(out[0]!.data).toEqual({ dia: '2026-09-11', xp: 320, coins: 160 });
  });

  it('subir de nível entra por último, pra ficar por cima na lista', () => {
    const out = dayCloseNotices(fatos({ summary: resumo({ userLevelUp: true, newLevel: 4, newLevelName: 'Dedicado' }) }));
    expect(out[out.length - 1]!.id).toBe('nivel:4');
    expect(out[out.length - 1]!.data).toEqual({ n: 4, nome: 'Dedicado' });
  });

  it('recorde só quando bate um dia anterior de verdade', () => {
    const bateu = dayCloseNotices(fatos({ bestDayXPBefore: 400, bestDayXPAfter: 520 }));
    expect(bateu.some((n) => n.kind === 'recorde-dia')).toBe(true);
    const primeiroDia = dayCloseNotices(fatos({ bestDayXPBefore: 0, bestDayXPAfter: 320 }));
    expect(primeiroDia.some((n) => n.kind === 'recorde-dia')).toBe(false);
  });

  it('moedas só quando o saldo CRUZA o preço do pet mais barato', () => {
    const cruzou = dayCloseNotices(fatos({ balanceBefore: 140, balanceAfter: 300 }));
    expect(cruzou.some((n) => n.kind === 'moedas')).toBe(true);
    // já dava pra comprar ontem: nada de lembrete diário pra gastar
    const jaDava = dayCloseNotices(fatos({ balanceBefore: 300, balanceAfter: 460 }));
    expect(jaDava.some((n) => n.kind === 'moedas')).toBe(false);
    const naoDeu = dayCloseNotices(fatos({ balanceBefore: 10, balanceAfter: 90 }));
    expect(naoDeu.some((n) => n.kind === 'moedas')).toBe(false);
  });

  it('marco de sequência entra com o bônus por dia, e o id carrega o dia (a sequência pode ser refeita)', () => {
    const out = dayCloseNotices(fatos({ streak: 7 }));
    const seq = out.find((n) => n.kind === 'sequencia')!;
    expect(seq.id).toBe('sequencia:2026-09-11:7');
    expect(seq.data).toEqual({ dia: '2026-09-11', n: 7, coins: 12 });
  });

  it('sequência fora de marco não vira linha', () => {
    expect(dayCloseNotices(fatos({ streak: 5 })).some((n) => n.kind === 'sequencia')).toBe(false);
  });

  it('o id do dia não depende do relógio: fechar o mesmo dia duas vezes dá o mesmo id', () => {
    const a = dayCloseNotices(fatos());
    const b = dayCloseNotices(fatos());
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
