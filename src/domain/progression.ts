// XP, moedas, níveis e skills. Regras puras — nada aqui lê estado global.

import type { CheckRecord, DateKey, PetId, StudyBlock } from './types';
import { dk } from './time';

/** Níveis do usuário (e dos pets — usam a mesma escala): [XP mínimo, nome]. */
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

/** Pet associado a um check. Retrocompat: checks antigos (`true`) não têm pet. */
export function checkPetOf(check: CheckRecord | undefined | null): PetId | null {
  if (!check || check === true) return null;
  return check.pet || null;
}

/** Contexto necessário pra decidir o bônus da skill Noturno no momento do check. */
export interface SkillContext {
  /** Pet equipado agora. */
  activePet: PetId | null;
  /** Skill ativa da coruja agora. */
  owlSkill: string | null;
  /** Timestamp (ms) da última troca de skill. */
  activatedAt: number;
  /** "Agora" — injetado pra ser testável. */
  now: Date;
}

/**
 * Skill Noturno: +5% XP em blocos de estudo a partir das 18h, com a coruja equipada
 * e a skill ativa DESDE ANTES do bloco começar (evita exploit de equipar no final).
 */
export function noturnoBonusEligible(
  b: Pick<StudyBlock, 'type' | 'time'>,
  dateKey: DateKey,
  ctx: SkillContext,
): boolean {
  if (b.type !== 'estudo') return false;
  if (ctx.activePet !== 'owl') return false;
  if (ctx.owlSkill !== 'noturno') return false;
  const hour = parseInt(b.time.split(':')[0] as string);
  if (hour < 18) return false;
  if (dateKey !== dk(ctx.now)) return false;
  const [bh, bm] = b.time.split(':').map(Number);
  const blockStart = new Date(ctx.now);
  blockStart.setHours(bh as number, bm as number, 0, 0);
  if ((ctx.activatedAt || 0) > blockStart.getTime()) return false;
  return true;
}

/** Bônus aditivo a gravar no check, dadas as skills ativas. Hoje só a Noturno. */
export function bonusForCheck(
  b: Pick<StudyBlock, 'type' | 'time'>,
  dateKey: DateKey,
  ctx: SkillContext,
): number {
  return noturnoBonusEligible(b, dateKey, ctx) ? 0.05 : 0;
}
