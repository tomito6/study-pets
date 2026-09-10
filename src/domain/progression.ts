// XP, moedas, níveis e skills. Regras puras — nada aqui lê estado global.

import type { BlockType, CheckRecord, DateKey, PetInstanceId, SkillId, StudyBlock } from './types';
import { blockMins, dk } from './time';

/** Níveis do usuário: [XP mínimo, nome]. (Os pets têm curva própria em `pets.ts`.) */
export const LEVELS: ReadonlyArray<readonly [number, string]> = [
  [0, 'Zero'], [250, 'Iniciante'], [750, 'Focado'], [1500, 'Dedicado'],
  [2500, 'Consistente'], [4000, 'Avançado'], [6000, 'Expert'], [10000, 'Mestre'],
];

/** XP de um bloco pela duração: estudo/evento rendem 2 XP por minuto. */
export function calcXP(minutes: number): number {
  return minutes * 2;
}

/** Moedas por bloco "estudo-equivalente": 1 moeda por minuto (XP é 2×, moeda é 1×). */
export function coinsForStudyBlock(pomoMins: number): number {
  return pomoMins;
}

/** Moedas de um bloco concluído. Pausa não rende moeda. */
export function coinsForBlock(b: Pick<StudyBlock, 'type'>, durMin: number): number {
  if (b.type === 'estudo' || b.type === 'event') return durMin;
  return 0;
}

/** Bônus diário por dia de streak. Ordem decrescente — primeiro match vence. */
export const DAILY_BONUS_TIERS: ReadonlyArray<readonly [number, number]> = [
  [30, 25], [14, 18], [7, 12], [3, 8], [1, 5],
];

export function dailyBonusForStreak(streakDay: number): number {
  for (const [min, coins] of DAILY_BONUS_TIERS) {
    if (streakDay >= min) return coins;
  }
  return 0;
}

export function getLevel(xp: number): string {
  let lv = LEVELS[0]![1];
  for (const [t, n] of LEVELS) {
    if (xp >= t) lv = n;
  }
  return lv;
}

export function getLevelIdx(xp: number): number {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i]![0]) return i;
  }
  return 0;
}

/** Progresso percentual dentro do nível atual. No último nível, 100. */
export function getLevelPct(xp: number): number {
  let lo = 0;
  let hi: number | null = null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i]![0]) {
      lo = LEVELS[i]![0];
      hi = LEVELS[i + 1] ? LEVELS[i + 1]![0] : null;
    }
  }
  return hi ? Math.round(((xp - lo) / (hi - lo)) * 100) : 100;
}

/**
 * XP efetivo de um check: base × (1 + bônus salvo no check).
 * Checks antigos eram `true` — sem bônus, valem o XP base.
 */
export function xpFromCheck(b: Pick<StudyBlock, 'xp'>, check: CheckRecord | undefined | null): number {
  if (!check || check === true || !check.bonus) return b.xp;
  return Math.round(b.xp * (1 + check.bonus));
}

/** Pet (instância) associado a um check. Retrocompat: checks antigos (`true`) não têm pet. */
export function checkPetOf(check: CheckRecord | undefined | null): PetInstanceId | null {
  if (!check || check === true) return null;
  return check.pet || null;
}

// ---------------------------------------------------------------- skills

/**
 * O que uma skill exige do bloco pra dar bônus. Regras pequenas e situacionais de
 * propósito — nada aqui pode virar "quem não tem tá perdendo". Todas são decidíveis
 * no momento do check, com o que o plano do dia já sabe.
 */
export type SkillRule =
  /** Estudo que começa na faixa `[from, to)` (hora cheia, 0–24). */
  | { kind: 'hour-range'; from: number; to: number }
  /** O primeiro estudo marcado no dia. */
  | { kind: 'first-study' }
  /** O último estudo/evento do plano do dia (a posição, não a ordem em que se marca). */
  | { kind: 'last-study' }
  /** Do `from`-ésimo estudo do dia em diante (1-based). */
  | { kind: 'nth-study'; from: number }
  /** Evento que conta como estudo (aula, prova). */
  | { kind: 'event' }
  /** Estudo logo depois de um bloco de um certo feitio. */
  | { kind: 'after'; what: 'long-break' | 'meal' | 'event' }
  /** O estudo/evento que faz o dia bater a meta diária. */
  | { kind: 'meets-goal' }
  /** Estudo dentro de um grupo de estudo. */
  | { kind: 'in-group' }
  /** O último estudo de um grupo, com todos os anteriores dele já marcados. */
  | { kind: 'completes-group' }
  /** Todo estudo do dia em que se volta depois de um dia que contava e ficou em branco. */
  | { kind: 'comeback' }
  /** Todo estudo do dia seguinte a uma folga (fim de semana pausado ou dia livre). */
  | { kind: 'after-rest' }
  /** Estudo num dia de folga em que se abriu janelas (o dia bônus). */
  | { kind: 'bonus-day' };

/**
 * A faixa de frequência da skill — o que mantém todas com a mesma força.
 *
 * `share` é a fatia do XP de um dia típico que a skill encosta, **pro estudante
 * cuja rotina ela combina** (referência: 8 estudos de 25 min). `weight` multiplica
 * o bônus por nível pra compensar. O produto `share × weight` é o mesmo nos três
 * tiers (`SKILL_DAY_SHARE`) — é isso que faz uma skill que acontece uma vez por
 * dia valer o mesmo que uma que acontece o dia inteiro. Teste garante.
 *
 * - `alta`  — acompanha o dia (~3 de 8 estudos): faixa de horário, maratona, grupo…
 * - `media` — acontece às vezes (~1,5 de 8): depois da pausa longa, evento…
 * - `baixa` — uma vez por dia (1 de 8): o primeiro, o último, o que bate a meta…
 */
export type SkillTier = 'alta' | 'media' | 'baixa';

export const SKILL_TIERS: Readonly<Record<SkillTier, { share: number; weight: number }>> = {
  alta: { share: 0.375, weight: 1 },
  media: { share: 0.1875, weight: 2 },
  baixa: { share: 0.125, weight: 3 },
};

/** `share × weight` de todo tier. Uma skill vale ~2% do XP do dia no Lv. 1 e ~6% no teto. */
export const SKILL_DAY_SHARE = 0.375;

export interface SkillDefinition {
  id: SkillId;
  name: string;
  /** Só a condição ("em estudos a partir das 18h") — o "+X% XP" vem de `skillDesc`. */
  desc: string;
  tier: SkillTier;
  rule: SkillRule;
}

/** Intervalo a partir desta duração conta como refeição pra Rumina (café de 15 min não é almoço). */
export const MEAL_MIN_MINS = 30;

/**
 * Bônus aditivo de XP de uma skill elegível, pelo nível do pet: 5% no Lv. 1,
 * +1% por nível, teto de 15% no Lv. 11 (~13h de estudo com o pet). Pequeno de
 * propósito — é reconhecimento, não "quem não tem tá perdendo". O tier multiplica
 * isso (ver `SKILL_TIERS`): num pomo de 25 min (50 XP), uma skill `alta` dá +3 XP
 * no Lv. 1 e +8 no teto; uma `baixa` dá +8 e +23, mas acontece um terço das vezes.
 */
export const SKILL_BONUS_BASE = 0.05;
export const SKILL_BONUS_PER_LEVEL = 0.01;
export const SKILL_BONUS_MAX = 0.15;

export function skillBonusForLevel(level: number): number {
  const l = Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1;
  return Math.min(SKILL_BONUS_MAX, Math.round((SKILL_BONUS_BASE + SKILL_BONUS_PER_LEVEL * (l - 1)) * 100) / 100);
}

/** O bônus que vai pro check: o do nível, vezes o peso do tier. */
export function skillBonus(skill: Pick<SkillDefinition, 'tier'>, level: number): number {
  const weight = SKILL_TIERS[skill.tier]?.weight ?? 1;
  return Math.round(skillBonusForLevel(level) * weight * 10000) / 10000;
}

/** O texto da skill como o pet a vê hoje: "+9% XP em estudos a partir das 18h". */
export function skillDesc(skill: Pick<SkillDefinition, 'desc' | 'tier'>, level: number): string {
  return `+${Math.round(skillBonus(skill, level) * 100)}% XP ${skill.desc}`;
}

/**
 * Catálogo de skills. As formas dos pets (`pets.ts`) referenciam estes ids.
 *
 * Cada uma é um jeito de estudar, não um número: a faixa do dia em que você rende,
 * o momento em que é difícil voltar, o dia em que você reaparece. O tier é o que
 * iguala a força — ver `SKILL_TIERS`. Ao acrescentar uma, o comentário deve dizer
 * quantas vezes ela acontece num dia de 8 estudos pra quem ela combina; é isso que
 * escolhe o tier.
 */
export const SKILLS: Record<SkillId, SkillDefinition> = {
  // --- a faixa do dia em que você rende (~3 de 8 estudos pra quem estuda naquela faixa)
  madrugador: { id: 'madrugador', name: 'Madrugador', desc: 'em estudos que começam antes das 9h', tier: 'alta', rule: { kind: 'hour-range', from: 0, to: 9 } },
  vespertino: { id: 'vespertino', name: 'Vespertino', desc: 'em estudos que começam entre 12h e 18h', tier: 'alta', rule: { kind: 'hour-range', from: 12, to: 18 } },
  noturno: { id: 'noturno', name: 'Noturno', desc: 'em estudos que começam a partir das 18h', tier: 'alta', rule: { kind: 'hour-range', from: 18, to: 24 } },
  // Mais estreita que a Noturno — cerca de metade das vezes —, então pesa o dobro.
  'lua-cheia': { id: 'lua-cheia', name: 'Lua cheia', desc: 'em estudos que começam a partir das 21h', tier: 'media', rule: { kind: 'hour-range', from: 21, to: 24 } },

  // --- o feitio do dia
  // Num dia de 8 estudos, do 5º em diante são 4; num dia curto, nenhum. Nunca cobra o dia longo.
  maratona: { id: 'maratona', name: 'Maratona', desc: 'do 5º estudo do dia em diante', tier: 'alta', rule: { kind: 'nth-study', from: 5 } },
  fiel: { id: 'fiel', name: 'Fiel', desc: 'no primeiro estudo do dia', tier: 'baixa', rule: { kind: 'first-study' } },
  'ponto-final': { id: 'ponto-final', name: 'Ponto final', desc: 'no último estudo do dia', tier: 'baixa', rule: { kind: 'last-study' } },
  constancia: { id: 'constancia', name: 'Constância', desc: 'no estudo que bate a meta do dia', tier: 'baixa', rule: { kind: 'meets-goal' } },

  // --- os retornos difíceis (o bloco depois de parar)
  preguica: { id: 'preguica', name: 'Preguiça', desc: 'no estudo logo depois de uma pausa longa', tier: 'media', rule: { kind: 'after', what: 'long-break' } },
  rumina: { id: 'rumina', name: 'Rumina', desc: 'no estudo logo depois de uma refeição (intervalo de 30 min ou mais)', tier: 'baixa', rule: { kind: 'after', what: 'meal' } },
  retomada: { id: 'retomada', name: 'Retomada', desc: 'no estudo logo depois de um evento', tier: 'baixa', rule: { kind: 'after', what: 'event' } },
  aula: { id: 'aula', name: 'Aula', desc: 'em eventos que contam como estudo', tier: 'media', rule: { kind: 'event' } },

  // --- o dia inteiro, quando o dia é especial
  // Recomeço e Descansado valem em TODO estudo daquele dia — por isso são `alta`.
  recomeco: { id: 'recomeco', name: 'Recomeço', desc: 'nos estudos do dia em que você volta depois de um dia em branco', tier: 'alta', rule: { kind: 'comeback' } },
  descansado: { id: 'descansado', name: 'Descansado', desc: 'nos estudos do dia seguinte a uma folga', tier: 'alta', rule: { kind: 'after-rest' } },
  'hora-extra': { id: 'hora-extra', name: 'Hora extra', desc: 'em estudos num dia de folga', tier: 'alta', rule: { kind: 'bonus-day' } },

  // --- os grupos de estudo (o trecho do dia com nome e objetivo)
  afinco: { id: 'afinco', name: 'Afinco', desc: 'em estudos dentro de um grupo', tier: 'alta', rule: { kind: 'in-group' } },
  empenho: { id: 'empenho', name: 'Empenho', desc: 'no estudo que completa um grupo', tier: 'baixa', rule: { kind: 'completes-group' } },
};

/** Contexto necessário pra decidir o bônus no momento do check. */
export interface SkillContext {
  /** Skill ativa do pet equipado agora (null = sem pet, ou sem skill). */
  activeSkill: SkillId | null;
  /**
   * Timestamp (ms) a partir do qual a skill vale: a última troca de skill ou o
   * momento em que o pet foi equipado, o que for mais recente.
   */
  activatedAt: number;
  /**
   * Nível do pet equipado pelo XP **já creditado** (dias fechados). Durante o dia
   * ele fica "atrasado" de propósito: o XP de hoje só entra ao fechar, então
   * marcar/desmarcar não sobe o bônus no meio do dia.
   */
  petLevel: number;
  /**
   * Estudos/eventos marcados hoje, no total. Só a Fiel usa: ela se limita sozinha
   * (com qualquer outro bloco marcado o contador nunca volta a zero), então
   * remarcar não devolve o bônus a mais ninguém.
   */
  studiesCheckedToday: number;
  /**
   * Estudos/eventos marcados que vêm ANTES deste bloco no plano do dia — não "o
   * que está marcado agora". A diferença é o anti-exploit: um contador do dia
   * inteiro cresce quando os outros blocos são marcados, então desmarcar e
   * remarcar um bloco cedo faria ele passar a valer o bônus de um bloco tardio.
   * Com o prefixo, um bloco só enxerga o que está atrás dele, que não muda de
   * lugar. Ver `studyMinsBefore`.
   */
  studiesCheckedBefore: number;
  /** Minutos dos estudos/eventos marcados que vêm antes deste no plano do dia. */
  studyMinsBefore: number;
  /** Meta diária (`config.dailyStudyMin`). */
  dailyStudyMin: number;
  /** O bloco imediatamente anterior no plano do dia; null se este é o primeiro. */
  prevBlock: { type: BlockType; mins: number } | null;
  /** Duração da pausa longa na config, pra reconhecer uma. */
  longBreakMins: number;
  /** Este é o último estudo/evento do plano do dia. */
  isLastStudy: boolean;
  /** O bloco cabe dentro de um grupo de estudo deste dia. */
  inGroup: boolean;
  /** Marcar este bloco fecha o grupo dele (era o último que faltava). */
  completesGroup: boolean;
  /** O dia que contava antes deste ficou em branco — hoje é uma volta. */
  comebackDay: boolean;
  /** Ontem foi folga (fim de semana pausado ou dia livre). */
  afterRestDay: boolean;
  /** Hoje é dia de folga com janelas abertas (dia bônus). */
  bonusDay: boolean;
  /** "Agora" — injetado pra ser testável. */
  now: Date;
}

/**
 * A skill ativa vale pra este bloco? Além da regra da skill, só conta hoje e só
 * se a skill já estava ativa ANTES do bloco começar (evita equipar no final).
 */
export function skillEligible(
  b: Pick<StudyBlock, 'type' | 'time' | 'endTime'>,
  dateKey: DateKey,
  ctx: SkillContext,
): boolean {
  if (!ctx.activeSkill) return false;
  const skill = SKILLS[ctx.activeSkill];
  if (!skill) return false;
  if (dateKey !== dk(ctx.now)) return false;
  const [bh, bm] = b.time.split(':').map(Number);
  const blockStart = new Date(ctx.now);
  blockStart.setHours(bh as number, bm as number, 0, 0);
  if ((ctx.activatedAt || 0) > blockStart.getTime()) return false;

  const study = b.type === 'estudo';
  /** Estudo ou evento — o que rende XP "de estudo". */
  const counts = study || b.type === 'event';
  const rule = skill.rule;
  switch (rule.kind) {
    case 'hour-range':
      return study && (bh as number) >= rule.from && (bh as number) < rule.to;
    case 'first-study':
      return study && ctx.studiesCheckedToday === 0;
    case 'last-study':
      return counts && ctx.isLastStudy;
    case 'nth-study':
      return study && ctx.studiesCheckedBefore >= rule.from - 1;
    case 'event':
      return b.type === 'event';
    case 'after':
      if (!study || !ctx.prevBlock) return false;
      if (rule.what === 'long-break') return ctx.prevBlock.type === 'pausa' && ctx.prevBlock.mins >= ctx.longBreakMins;
      if (rule.what === 'meal') return ctx.prevBlock.type === 'intervalo' && ctx.prevBlock.mins >= MEAL_MIN_MINS;
      return ctx.prevBlock.type === 'event';
    case 'meets-goal':
      return (
        counts &&
        ctx.dailyStudyMin > 0 &&
        ctx.studyMinsBefore < ctx.dailyStudyMin &&
        ctx.studyMinsBefore + blockMins(b) >= ctx.dailyStudyMin
      );
    case 'in-group':
      return counts && ctx.inGroup;
    case 'completes-group':
      return counts && ctx.completesGroup;
    case 'comeback':
      return counts && ctx.comebackDay;
    case 'after-rest':
      return counts && ctx.afterRestDay;
    case 'bonus-day':
      return counts && ctx.bonusDay;
  }
}

/** Bônus aditivo a gravar no check, dada a skill ativa. */
export function bonusForCheck(
  b: Pick<StudyBlock, 'type' | 'time' | 'endTime'>,
  dateKey: DateKey,
  ctx: SkillContext,
): number {
  const skill = ctx.activeSkill ? SKILLS[ctx.activeSkill] : undefined;
  if (!skill || !skillEligible(b, dateKey, ctx)) return 0;
  return skillBonus(skill, ctx.petLevel);
}
