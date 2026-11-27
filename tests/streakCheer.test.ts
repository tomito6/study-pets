// O parabéns pela sequência, puro (src/domain/streakCheer.ts): quando ele aparece, o que
// é recorde, e a trilha. O que está em jogo é "uma vez por aumento" — um pop-up que
// repete a festa a cada desmarcar/marcar deixa de ser parabéns e vira ruído.

import { describe, expect, it } from 'vitest';
import {
  normalizeStreakCheerMark,
  previousBestStreak,
  streakCheerFor,
  streakTrail,
  TRAIL_MAX,
} from '../src/domain/streakCheer';
import { dailyBonusForStreak } from '../src/domain/progression';
import { strings } from '../src/shared/strings';

const HOJE = '2026-09-02';
const base = { before: 0, after: 1, previousBest: 0, today: HOJE, mark: null };

describe('streakCheerFor', () => {
  it('a sequência cresceu: comemora, com o número e o bônus do dia', () => {
    expect(streakCheerFor({ ...base, after: 3 })).toEqual({ n: 3, record: false, milestone: true, coins: dailyBonusForStreak(3) });
    expect(streakCheerFor(base)).toEqual({ n: 1, record: false, milestone: false, coins: dailyBonusForStreak(1) });
  });

  it('não cresceu (ou caiu): nada', () => {
    expect(streakCheerFor({ ...base, before: 3, after: 3 })).toBeNull();
    expect(streakCheerFor({ ...base, before: 3, after: 0 })).toBeNull();
    expect(streakCheerFor({ ...base, before: 0, after: 0 })).toBeNull();
  });

  it('uma vez por aumento: desmarcar e remarcar volta ao MESMO número, e a marca recusa', () => {
    const mark = { day: HOJE, n: 3 };
    expect(streakCheerFor({ ...base, after: 3, mark })).toBeNull();
    expect(streakCheerFor({ ...base, after: 2, mark })).toBeNull();
  });

  it('a marca de outro dia não cala o de hoje, nem a de hoje cala um número MAIOR', () => {
    expect(streakCheerFor({ ...base, after: 3, mark: { day: '2026-09-01', n: 3 } })?.n).toBe(3);
    // Hoje já comemorou "1 dia"; à noite a pessoa completa o bloco de ontem e as duas sequências emendam.
    expect(streakCheerFor({ ...base, before: 1, after: 5, mark: { day: HOJE, n: 1 } })?.n).toBe(5);
  });

  it('recorde: só no dia em que PASSA a maior sequência anterior — não em todos os dias depois', () => {
    // A maior que já tinha acabado era de 4. Ontem a atual estava em 4 (empatada); hoje passa.
    expect(streakCheerFor({ ...base, after: 5, previousBest: 4 })?.record).toBe(true);
    // No dia seguinte ela já tinha passado: não é recorde de novo.
    expect(streakCheerFor({ ...base, after: 6, previousBest: 4 })?.record).toBe(false);
    // Ainda não chegou lá.
    expect(streakCheerFor({ ...base, after: 3, previousBest: 4 })?.record).toBe(false);
  });

  it('recorde precisa de uma sequência de verdade antes: passar de "1 dia" não é notícia', () => {
    expect(streakCheerFor({ ...base, after: 2, previousBest: 1 })?.record).toBe(false);
    expect(streakCheerFor({ ...base, after: 2, previousBest: 0 })?.record).toBe(false);
  });

  it('recorde num salto (emenda retroativa): vale se o salto cruzou a marca', () => {
    expect(streakCheerFor({ ...base, before: 1, after: 5, previousBest: 3 })?.record).toBe(true);
    expect(streakCheerFor({ ...base, before: 4, after: 6, previousBest: 3 })?.record).toBe(false);
  });

  it('marco: os degraus do bônus (3, 7, 14, 30) e de 30 em 30 depois', () => {
    const marco = (n: number) => streakCheerFor({ ...base, after: n })!.milestone;
    expect([1, 2, 3, 4, 7, 14, 29, 30, 45, 60].map(marco)).toEqual([false, false, true, false, true, true, false, true, false, true]);
  });
});

describe('previousBestStreak', () => {
  const dias = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'];
  const mins = (feitos: string[]) => Object.fromEntries(feitos.map((d) => [d, 60]));

  it('ignora a sequência em andamento — senão o "recorde" cairia todo dia', () => {
    // d1–d3 feitos, d4 em branco, d5–d8 feitos: a atual é 4, a maior ANTERIOR é 3.
    const m = mins(['d1', 'd2', 'd3', 'd5', 'd6', 'd7', 'd8']);
    expect(previousBestStreak(m, dias, 'd8', 60, 4)).toBe(3);
  });

  it('sem nada antes da atual: zero', () => {
    expect(previousBestStreak(mins(dias), dias, 'd8', 60, 8)).toBe(0);
    expect(previousBestStreak({}, dias, 'fora', 60, 0)).toBe(0);
  });
});

describe('streakTrail', () => {
  it('um ponto por dia, até uma semana; passou disso, avisa que vem de antes', () => {
    expect(streakTrail(1)).toEqual({ dots: 1, more: false });
    expect(streakTrail(TRAIL_MAX)).toEqual({ dots: TRAIL_MAX, more: false });
    expect(streakTrail(12)).toEqual({ dots: TRAIL_MAX, more: true });
    expect(streakTrail(0)).toEqual({ dots: 0, more: false });
  });
});

describe('normalizeStreakCheerMark', () => {
  it('lê a marca inteira e recusa o resto', () => {
    expect(normalizeStreakCheerMark({ day: HOJE, n: 3 })).toEqual({ day: HOJE, n: 3 });
    for (const lixo of [null, undefined, 'x', 3, [], {}, { day: HOJE }, { n: 3 }, { day: 'ontem', n: 3 }, { day: HOJE, n: 0 }, { day: HOJE, n: 1.5 }, { day: HOJE, n: '3' }]) {
      expect(normalizeStreakCheerMark(lixo), JSON.stringify(lixo)).toBeNull();
    }
  });
});

// O app promete que sequência é pra comemorar, não pra cobrar. O texto é onde essa
// promessa quebra primeiro — então ela é cobrada aqui, em toda frase que o pop-up sabe dizer.
describe('o texto do pop-up', () => {
  const casos = [1, 2, 3, 5, 7, 14, 30, 45, 60, 90].flatMap((n) =>
    [true, false].flatMap((record) =>
      [null, 'Mia'].map((pet) => strings.streak.sub({ n, record, milestone: [3, 7, 14, 30, 60, 90].includes(n) }, pet)),
    ),
  );

  it('nunca ameaça: nada de "perder", "não quebre", "amanhã" ou "falta"', () => {
    for (const frase of casos) {
      expect(frase, frase).not.toMatch(/perd|quebr|amanh|falt|não deixe|cuidado/i);
      expect(frase).not.toContain('undefined');
      expect(frase.length).toBeGreaterThan(10);
    }
  });

  // Correção do Tomi (2026-11-27): o cartão é um parabéns pela SEQUÊNCIA. "Meta de hoje batida"
  // lia como aviso de meta — a frase fala da sequência, e a meta não entra.
  it('fala da sequência, não da meta do dia', () => {
    expect(strings.streak.kicker).toBe('Parabéns!');
    for (const frase of casos) {
      expect(frase, frase).toMatch(/sequência/);
      expect(frase, frase).not.toMatch(/meta/i);
    }
  });

  it('o título separa o número (é ele que vira na animação) e a frase falada é inteira', () => {
    expect(strings.streak.title(1)).toEqual({ antes: 'Dia ', depois: '' });
    expect(strings.streak.title(4)).toEqual({ antes: '', depois: ' dias seguidos' });
    expect(strings.streak.spoken(4)).toBe('Parabéns! Sua sequência chegou a 4 dias seguidos.');
    expect(strings.streak.spoken(1)).toBe('Parabéns! Sua sequência começou: dia 1.');
  });
});
