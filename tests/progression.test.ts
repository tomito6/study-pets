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
  skillBonus,
  skillBonusForLevel,
  skillDesc,
  skillEligible,
  xpFromCheck,
  SKILLS,
  SKILL_DAY_SHARE,
  SKILL_TIERS,
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
    expect(coinsForBlock(bloco('intervalo'), 60)).toBe(0);
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

describe('skills: o catálogo se equilibra sozinho', () => {
  it('os três tiers têm a mesma força: fatia do dia × peso é constante', () => {
    for (const [tier, { share, weight }] of Object.entries(SKILL_TIERS)) {
      expect(share * weight, tier).toBeCloseTo(SKILL_DAY_SHARE, 6);
    }
  });

  it('toda skill declara um tier conhecido, nome e condição; nenhum id se repete de nome', () => {
    const nomes = new Set<string>();
    for (const [id, s] of Object.entries(SKILLS)) {
      expect(s.id, id).toBe(id);
      expect(SKILL_TIERS[s.tier], id).toBeDefined();
      expect(s.name.length, id).toBeGreaterThan(0);
      // A condição entra depois de "+X% XP " — tem que ler como frase, minúscula.
      expect(s.desc[0], id).toBe(s.desc[0]!.toLowerCase());
      expect(nomes.has(s.name), s.name).toBe(false);
      nomes.add(s.name);
    }
  });

  it('duas skills nunca têm a mesma condição — cada uma é um jeito de estudar', () => {
    const regras = Object.values(SKILLS).map((s) => JSON.stringify(s.rule));
    expect(new Set(regras).size).toBe(regras.length);
  });

  it('skillBonus: o peso do tier multiplica o bônus do nível', () => {
    const alta = SKILLS.noturno!;
    const media = SKILLS['lua-cheia']!;
    const baixa = SKILLS.fiel!;
    expect([1, 5, 30].map((l) => skillBonus(alta, l))).toEqual([0.05, 0.09, 0.15]);
    expect([1, 5, 30].map((l) => skillBonus(media, l))).toEqual([0.1, 0.18, 0.3]);
    expect([1, 5, 30].map((l) => skillBonus(baixa, l))).toEqual([0.15, 0.27, 0.45]);
  });

  it('skillBonusForLevel: 5% no Lv. 1, +1% por nível, teto de 15% no Lv. 11; nível inválido vale o Lv. 1', () => {
    expect([1, 2, 5, 10, 11, 12, 40].map(skillBonusForLevel)).toEqual([0.05, 0.06, 0.09, 0.14, 0.15, 0.15, 0.15]);
    expect(skillBonusForLevel(0)).toBe(0.05);
    expect(skillBonusForLevel(NaN)).toBe(0.05);
  });

  it('skillDesc: o texto já traz o "+X% XP" do nível e do tier', () => {
    expect(skillDesc(SKILLS.noturno!, 5)).toBe('+9% XP em estudos que começam a partir das 18h');
    expect(skillDesc(SKILLS.fiel!, 1)).toBe('+15% XP no primeiro estudo do dia');
    expect(skillDesc(SKILLS['lua-cheia']!, 1)).toBe('+10% XP em estudos que começam a partir das 21h');
  });

  it('Noturno e Lua cheia não se anulam: a mais estreita paga mais', () => {
    // O bug antigo: as duas davam o mesmo %, então a de 21h nunca valia a pena.
    const às19h = { noturno: skillBonus(SKILLS.noturno!, 1), lua: 0 };
    const às22h = { noturno: skillBonus(SKILLS.noturno!, 1), lua: skillBonus(SKILLS['lua-cheia']!, 1) };
    expect(às19h.noturno).toBeGreaterThan(às19h.lua);
    expect(às22h.lua).toBeGreaterThan(às22h.noturno);
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
    studyMinsToday: 0,
    dailyStudyMin: 60,
    prevBlock: null,
    longBreakMins: 15,
    petLevel: 1,
    isLastStudy: false,
    inGroup: false,
    completesGroup: false,
    comebackDay: false,
    afterRestDay: false,
    bonusDay: false,
    now: agora,
    ...over,
  });

  const estudo = (time: string, endTime: string) => ({ type: 'estudo' as const, time, endTime });
  const evento = (time: string, endTime: string) => ({ type: 'event' as const, time, endTime });
  const blocoNoturno = estudo('18:30', '18:55');
  const blocoManha = estudo('09:00', '09:25');

  it('Noturno vale pra estudo a partir das 18h', () => {
    expect(skillEligible(blocoNoturno, HOJE, ctx())).toBe(true);
    expect(skillEligible(estudo('17:59', '18:24'), HOJE, ctx())).toBe(false);
    expect(skillEligible({ type: 'pausa', time: '19:00', endTime: '19:05' }, HOJE, ctx())).toBe(false);
  });

  it('Lua cheia só a partir das 21h', () => {
    expect(skillEligible(blocoNoturno, HOJE, ctx({ activeSkill: 'lua-cheia' }))).toBe(false);
    expect(skillEligible(estudo('21:00', '21:25'), HOJE, ctx({ activeSkill: 'lua-cheia', now: new Date('2026-09-02T21:30:00') }))).toBe(true);
  });

  it('Madrugador vale pra estudo antes das 9h', () => {
    const cedo = ctx({ activeSkill: 'madrugador', now: new Date('2026-09-02T09:30:00') });
    expect(skillEligible(estudo('08:30', '08:55'), HOJE, cedo)).toBe(true);
    expect(skillEligible(blocoManha, HOJE, cedo)).toBe(false);
  });

  it('Vespertino cobre o meio do dia — a faixa que não tinha skill nenhuma', () => {
    const tarde = ctx({ activeSkill: 'vespertino' });
    expect(skillEligible(estudo('12:00', '12:25'), HOJE, tarde)).toBe(true);
    expect(skillEligible(estudo('17:30', '17:55'), HOJE, tarde)).toBe(true);
    expect(skillEligible(estudo('11:59', '12:24'), HOJE, tarde)).toBe(false);
    expect(skillEligible(blocoNoturno, HOJE, tarde)).toBe(false);
  });

  it('Fiel vale só pro primeiro estudo marcado no dia', () => {
    expect(skillEligible(blocoManha, HOJE, ctx({ activeSkill: 'fiel' }))).toBe(true);
    expect(skillEligible(blocoManha, HOJE, ctx({ activeSkill: 'fiel', studiesCheckedToday: 1 }))).toBe(false);
    expect(skillEligible(evento('09:00', '10:00'), HOJE, ctx({ activeSkill: 'fiel' }))).toBe(false);
  });

  it('Ponto final vale pro último estudo do PLANO, não pro último que você marcou', () => {
    const c = (over: Partial<SkillContext>) => ctx({ activeSkill: 'ponto-final', ...over });
    expect(skillEligible(blocoNoturno, HOJE, c({ isLastStudy: true }))).toBe(true);
    expect(skillEligible(blocoNoturno, HOJE, c({ isLastStudy: false, studiesCheckedToday: 7 }))).toBe(false);
    // Evento também fecha o dia.
    expect(skillEligible(evento('19:00', '20:00'), HOJE, c({ isLastStudy: true }))).toBe(true);
  });

  it('Maratona vale do 5º estudo do dia em diante', () => {
    const c = (studiesCheckedToday: number) => ctx({ activeSkill: 'maratona', studiesCheckedToday });
    expect(skillEligible(blocoManha, HOJE, c(3))).toBe(false); // este é o 4º
    expect(skillEligible(blocoManha, HOJE, c(4))).toBe(true); // este é o 5º
    expect(skillEligible(blocoManha, HOJE, c(9))).toBe(true);
  });

  it('Aula vale só pra evento que conta como estudo', () => {
    expect(skillEligible(evento('10:00', '11:30'), HOJE, ctx({ activeSkill: 'aula' }))).toBe(true);
    expect(skillEligible(blocoManha, HOJE, ctx({ activeSkill: 'aula' }))).toBe(false);
  });

  it('Retomada vale pro estudo logo depois de um evento — a volta da aula', () => {
    const c = (prevBlock: SkillContext['prevBlock']) => ctx({ activeSkill: 'retomada', prevBlock });
    expect(skillEligible(blocoManha, HOJE, c({ type: 'event', mins: 90 }))).toBe(true);
    expect(skillEligible(blocoManha, HOJE, c({ type: 'intervalo', mins: 90 }))).toBe(false);
    expect(skillEligible(blocoManha, HOJE, c({ type: 'pausa', mins: 15 }))).toBe(false);
    expect(skillEligible(blocoManha, HOJE, c(null))).toBe(false);
  });

  it('Preguiça vale pro estudo logo depois de uma pausa longa', () => {
    const c = (prevBlock: SkillContext['prevBlock']) => ctx({ activeSkill: 'preguica', prevBlock });
    expect(skillEligible(blocoManha, HOJE, c({ type: 'pausa', mins: 15 }))).toBe(true);
    expect(skillEligible(blocoManha, HOJE, c({ type: 'pausa', mins: 5 }))).toBe(false);
    expect(skillEligible(blocoManha, HOJE, c({ type: 'intervalo', mins: 60 }))).toBe(false);
    expect(skillEligible(blocoManha, HOJE, c(null))).toBe(false);
  });

  it('Rumina vale pro estudo logo depois de uma refeição: intervalo de 30 min ou mais', () => {
    const c = (prevBlock: SkillContext['prevBlock']) => ctx({ activeSkill: 'rumina', prevBlock });
    expect(skillEligible(blocoManha, HOJE, c({ type: 'intervalo', mins: 60 }))).toBe(true);
    expect(skillEligible(blocoManha, HOJE, c({ type: 'intervalo', mins: 30 }))).toBe(true);
    expect(skillEligible(blocoManha, HOJE, c({ type: 'intervalo', mins: 15 }))).toBe(false); // um café não é almoço
    expect(skillEligible(blocoManha, HOJE, c({ type: 'pausa', mins: 60 }))).toBe(false);
    expect(skillEligible(blocoManha, HOJE, c({ type: 'event', mins: 60 }))).toBe(false); // aula não é refeição
  });

  it('Constância vale pro bloco que faz o dia bater a meta', () => {
    const c = (studyMinsToday: number, dailyStudyMin = 60) => ctx({ activeSkill: 'constancia', studyMinsToday, dailyStudyMin });
    expect(skillEligible(blocoManha, HOJE, c(40))).toBe(true); // 40 + 25 ≥ 60
    expect(skillEligible(blocoManha, HOJE, c(35))).toBe(true); // exatamente 60
    expect(skillEligible(blocoManha, HOJE, c(10))).toBe(false); // ainda longe
    expect(skillEligible(blocoManha, HOJE, c(60))).toBe(false); // já tinha batido
    expect(skillEligible(evento('10:00', '11:00'), HOJE, c(10))).toBe(true); // evento conta
    expect(skillEligible(blocoManha, HOJE, c(40, 0))).toBe(false); // sem meta, sem bônus
  });

  it('Afinco vale dentro de um grupo; Empenho só no check que fecha o grupo', () => {
    expect(skillEligible(blocoManha, HOJE, ctx({ activeSkill: 'afinco', inGroup: true }))).toBe(true);
    expect(skillEligible(blocoManha, HOJE, ctx({ activeSkill: 'afinco', inGroup: false }))).toBe(false);
    expect(skillEligible(blocoManha, HOJE, ctx({ activeSkill: 'empenho', inGroup: true, completesGroup: true }))).toBe(true);
    expect(skillEligible(blocoManha, HOJE, ctx({ activeSkill: 'empenho', inGroup: true }))).toBe(false);
  });

  it('Recomeço vale em TODO estudo do dia da volta — é o oposto de cobrar sequência', () => {
    const volta = ctx({ activeSkill: 'recomeco', comebackDay: true });
    expect(skillEligible(blocoManha, HOJE, volta)).toBe(true);
    expect(skillEligible(blocoNoturno, HOJE, { ...volta, studiesCheckedToday: 5 })).toBe(true);
    expect(skillEligible(evento('10:00', '11:00'), HOJE, volta)).toBe(true);
    expect(skillEligible(blocoManha, HOJE, ctx({ activeSkill: 'recomeco' }))).toBe(false);
  });

  it('Descansado vale no dia seguinte a uma folga; Hora extra, no próprio dia de folga', () => {
    expect(skillEligible(blocoManha, HOJE, ctx({ activeSkill: 'descansado', afterRestDay: true }))).toBe(true);
    expect(skillEligible(blocoManha, HOJE, ctx({ activeSkill: 'descansado' }))).toBe(false);
    expect(skillEligible(blocoManha, HOJE, ctx({ activeSkill: 'hora-extra', bonusDay: true }))).toBe(true);
    expect(skillEligible(blocoManha, HOJE, ctx({ activeSkill: 'hora-extra' }))).toBe(false);
  });

  it('nenhuma skill vale pra pausa — pausa não é conquista, é parte do plano', () => {
    const pausa = { type: 'pausa' as const, time: '19:00', endTime: '19:15' };
    const tudo: Partial<SkillContext> = {
      isLastStudy: true, inGroup: true, completesGroup: true, comebackDay: true,
      afterRestDay: true, bonusDay: true, studiesCheckedToday: 9, studyMinsToday: 0,
      prevBlock: { type: 'intervalo', mins: 60 },
    };
    for (const id of Object.keys(SKILLS)) {
      expect(skillEligible(pausa, HOJE, ctx({ ...tudo, activeSkill: id })), id).toBe(false);
    }
  });

  it('sem skill ou skill desconhecida: nada', () => {
    expect(skillEligible(blocoNoturno, HOJE, ctx({ activeSkill: null }))).toBe(false);
    expect(skillEligible(blocoNoturno, HOJE, ctx({ activeSkill: 'xyz' }))).toBe(false);
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

  it('bonusForCheck: elegível vale o bônus do nível vezes o peso do tier; senão 0', () => {
    expect(bonusForCheck(blocoNoturno, HOJE, ctx())).toBe(0.05);
    expect(bonusForCheck(blocoNoturno, HOJE, ctx({ petLevel: 5 }))).toBe(0.09);
    expect(bonusForCheck(blocoNoturno, HOJE, ctx({ petLevel: 30 }))).toBe(0.15);
    // Fiel é tier `baixa`: acontece um terço das vezes, então paga o triplo.
    expect(bonusForCheck(blocoManha, HOJE, ctx({ activeSkill: 'fiel' }))).toBe(0.15);
    expect(bonusForCheck(blocoManha, HOJE, ctx({ activeSkill: 'fiel', petLevel: 30 }))).toBe(0.45);
    expect(bonusForCheck(blocoNoturno, HOJE, ctx({ activeSkill: null, petLevel: 30 }))).toBe(0);
  });
});
