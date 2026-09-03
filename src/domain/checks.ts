// Regras de check: quem pode ser marcado, e quando o XP dos pets é creditado.
// Puro — o estado e a persistência ficam em quem chama.

import type { ChecksByDate, DateKey, PetInstanceId, StudyBlock, TimeString } from './types';
import { checkPetOf, xpFromCheck } from './progression';
import { dk } from './time';

export function isChecked(checks: ChecksByDate, dateKey: DateKey, blockTime: TimeString): boolean {
  return !!(checks[dateKey] && checks[dateKey]![blockTime]);
}

export function isDayClosed(
  closedDays: Record<DateKey, boolean> | undefined,
  dateKey: DateKey,
): boolean {
  return !!(closedDays && closedDays[dateKey]);
}

/** Um dia é futuro se vem depois do dia de hoje. Comparação de string funciona no formato ISO. */
export function isFutureDay(dateKey: DateKey, now: Date): boolean {
  return dateKey > dk(now);
}

/**
 * Um bloco só aceita marcar/desmarcar se o dia não foi encerrado e ainda chegou.
 * Dia encerrado é definitivo (read-only); dia futuro não existe ainda.
 */
export function canToggleCheck(
  dateKey: DateKey,
  ctx: { closedDays?: Record<DateKey, boolean>; now: Date },
): boolean {
  if (isDayClosed(ctx.closedDays, dateKey)) return false;
  if (isFutureDay(dateKey, ctx.now)) return false;
  return true;
}

export interface PendingPetXPInput {
  checks: ChecksByDate;
  /** Último dia já creditado. `null` = nunca rodou (primeira execução). */
  xpProcessedUntil: DateKey | null;
  todayKey: DateKey;
  yesterdayKey: DateKey;
  /** Se hoje foi encerrado manualmente, hoje também entra. */
  dayClosed: (key: DateKey) => boolean;
  /** Blocos do dia — quem chama decide como gerar. */
  getBlocks: (key: DateKey) => StudyBlock[];
}

export interface PendingPetXPResult {
  /** XP a somar por pet adotado (id da instância — o que o check guarda). */
  gains: Record<PetInstanceId, number>;
  /** Novo valor de `xpProcessedUntil`. */
  processedUntil: DateKey;
  /** Primeira execução: zera o XP acumulado antes de aplicar os ganhos. */
  resetXp: boolean;
}

/**
 * Calcula o XP pendente dos pets — o que foi marcado em dias que já fecharam e
 * ainda não foi creditado.
 *
 * Idempotente por construção: só olha dias no intervalo
 * `(xpProcessedUntil, endKey]`, então rodar duas vezes não credita duas vezes.
 * Devolve `null` quando não há nada a fazer.
 *
 * Só estudo e evento contam — pausa não rende XP pro pet. Check feito sem pet
 * equipado não credita ninguém.
 */
export function computePendingPetXP(input: PendingPetXPInput): PendingPetXPResult | null {
  const { checks, todayKey, yesterdayKey, dayClosed, getBlocks } = input;

  const resetXp = input.xpProcessedUntil == null;
  // Na primeira execução, o passado não é aplicado retroativamente: começa de ontem.
  const from: DateKey = resetXp ? yesterdayKey : input.xpProcessedUntil!;

  // Hoje só entra se foi encerrado manualmente.
  const endKey: DateKey = dayClosed(todayKey) ? todayKey : yesterdayKey;

  if (from >= endKey) {
    // Nada a creditar. Mas se é a primeira execução, o reset ainda precisa acontecer.
    return resetXp ? { gains: {}, processedUntil: from, resetXp: true } : null;
  }

  const gains: Record<PetInstanceId, number> = {};
  const dayKeys = Object.keys(checks)
    .filter((k) => k > from && k <= endKey)
    .sort();

  for (const dayKey of dayKeys) {
    for (const b of getBlocks(dayKey)) {
      if (b.type !== 'estudo' && b.type !== 'event') continue;
      if (!isChecked(checks, dayKey, b.time)) continue;
      const check = checks[dayKey]![b.time];
      const petId = checkPetOf(check);
      if (!petId) continue;
      gains[petId] = (gains[petId] || 0) + (xpFromCheck(b, check) || 0);
    }
  }

  return { gains, processedUntil: endKey, resetXp };
}
