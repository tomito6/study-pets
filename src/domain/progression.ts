// XP, moedas, níveis e skills. Regras puras — nada aqui lê estado global.

import type { BlockType, CheckRecord, DateKey, PetInstanceId, SkillId, StudyBlock } from './types';
import { dk, timeToMins } from './time';

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
  /** Estudo que começa a partir de `hour`. */
  | { kind: 'after-hour'; hour: number }
  /** Estudo que começa antes de `hour`. */
  | { kind: 'before-hour'; hour: number }
  /** O primeiro estudo marcado no dia. */
  | { kind: 'first-study' }
  /** Evento que conta como estudo (aula, prova). */
  | { kind: 'event' }
  /** Estudo logo depois de uma pausa longa. */
  | { kind: 'after-long-break' }
  /** Estudo logo depois do almoço. */
  | { kind: 'after-lunch' }
  /** O estudo/evento que faz o dia bater a meta diária. */
  | { kind: 'meets-goal' };

export interface SkillDefinition {
  id: SkillId;
  name: string;
  desc: string;
  rule: SkillRule;
}

/** Bônus aditivo de XP de toda skill elegível. */
export const SKILL_BONUS = 0.05;

/** Catálogo de skills. As formas dos pets (`pets.ts`) referenciam estes ids. */
export const SKILLS: Record<SkillId, SkillDefinition> = {
  noturno: { id: 'noturno', name: 'Noturno', desc: '+5% XP em estudos a partir das 18h', rule: { kind: 'after-hour', hour: 18 } },
  'lua-cheia': { id: 'lua-cheia', name: 'Lua cheia', desc: '+5% XP em estudos a partir das 21h', rule: { kind: 'after-hour', hour: 21 } },
  madrugador: { id: 'madrugador', name: 'Madrugador', desc: '+5% XP em estudos antes das 9h', rule: { kind: 'before-hour', hour: 9 } },
  fiel: { id: 'fiel', name: 'Fiel', desc: '+5% XP no primeiro estudo do dia', rule: { kind: 'first-study' } },
  aula: { id: 'aula', name: 'Aula', desc: '+5% XP em eventos que contam como estudo', rule: { kind: 'event' } },
  preguica: { id: 'preguica', name: 'Preguiça', desc: '+5% XP no estudo logo depois de uma pausa longa', rule: { kind: 'after-long-break' } },
  rumina: { id: 'rumina', name: 'Rumina', desc: '+5% XP no estudo logo depois do almoço', rule: { kind: 'after-lunch' } },
  constancia: { id: 'constancia', name: 'Constância', desc: '+5% XP no estudo que bate a meta do dia', rule: { kind: 'meets-goal' } },
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
  /** Estudos/eventos já marcados hoje antes deste check. */
  studiesCheckedToday: number;
  /** Minutos de estudo/evento já marcados hoje antes deste check. */
  studyMinsToday: number;
  /** Meta diária (`config.dailyStudyMin`). */
  dailyStudyMin: number;
  /** O bloco imediatamente anterior no plano do dia; null se este é o primeiro. */
  prevBlock: { type: BlockType; mins: number } | null;
  /** Duração da pausa longa na config, pra reconhecer uma. */
  longBreakMins: number;
  /** "Agora" — injetado pra ser testável. */
  now: Date;
}

const blockMins = (b: Pick<StudyBlock, 'time' | 'endTime'>): number => timeToMins(b.endTime) - timeToMins(b.time);

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
  const rule = skill.rule;
  switch (rule.kind) {
    case 'after-hour':
      return study && (bh as number) >= rule.hour;
    case 'before-hour':
      return study && (bh as number) < rule.hour;
    case 'first-study':
      return study && ctx.studiesCheckedToday === 0;
    case 'event':
      return b.type === 'event';
    case 'after-long-break':
      return study && !!ctx.prevBlock && ctx.prevBlock.type === 'pausa' && ctx.prevBlock.mins >= ctx.longBreakMins;
    case 'after-lunch':
      return study && ctx.prevBlock?.type === 'almoco';
    case 'meets-goal':
      return (
        (study || b.type === 'event') &&
        ctx.dailyStudyMin > 0 &&
        ctx.studyMinsToday < ctx.dailyStudyMin &&
        ctx.studyMinsToday + blockMins(b) >= ctx.dailyStudyMin
      );
  }
}

/** Bônus aditivo a gravar no check, dada a skill ativa. */
export function bonusForCheck(
  b: Pick<StudyBlock, 'type' | 'time' | 'endTime'>,
  dateKey: DateKey,
  ctx: SkillContext,
): number {
  return skillEligible(b, dateKey, ctx) ? SKILL_BONUS : 0;
}
