// Regras de check: quem pode ser marcado, e quando o XP dos pets é creditado.
// Puro — o estado e a persistência ficam em quem chama.

import type { ChecksByDate, DateKey, PenaltiesByDate, PetInstanceId, StudyBlock, TimeString } from './types';
import { isForfeited } from './hardcore';
import { checkPetOf, xpFromCheck } from './progression';
import { dateFromKey, dk, timeToMins } from './time';

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

/**
 * O bloco já começou? Em dia passado, sempre — o dia inteiro já aconteceu. Em dia
 * futuro a pergunta nem chega aqui (`canToggleCheck` já recusou). Em HOJE, compara
 * o relógio com o início do bloco.
 *
 * A régua é "já começou", não "já terminou", de propósito: terminar antes do fim do
 * plano é legítimo (a pessoa acabou a leitura) e o próprio modo foco marca o bloco
 * pelo fim ajustado de uma pausa, que pode cair antes do `endTime`. "Já terminou"
 * recusaria o check automático do app.
 */
export function hasBlockStarted(dateKey: DateKey, blockTime: TimeString, now: Date): boolean {
  const hoje = dk(now);
  if (dateKey !== hoje) return dateKey < hoje;
  return now.getHours() * 60 + now.getMinutes() >= timeToMins(blockTime);
}

/**
 * `canToggleCheck` mais as duas regras do bloco: um bloco abandonado no modo
 * hardcore não pode ser marcado depois (senão desistir seria de graça), e um bloco
 * que ainda não começou não pode ser marcado — nem hoje.
 *
 * A segunda nasceu em 2026-09-13: até então o dia era a única régua, então às 09:00
 * dava pra marcar o bloco das 17:45 e levar XP, moedas, meta e sequência. Era o que
 * fazia o plano parecer auto-declaração.
 */
export function canCheckBlock(
  dateKey: DateKey,
  blockTime: TimeString,
  ctx: { closedDays?: Record<DateKey, boolean>; penalties?: PenaltiesByDate; now: Date },
): boolean {
  if (!canToggleCheck(dateKey, ctx)) return false;
  if (isForfeited(ctx.penalties, dateKey, blockTime)) return false;
  return hasBlockStarted(dateKey, blockTime, ctx.now);
}

/** Quantos dias pra trás vale a pena procurar o último dia que contou. */
export const COUNTING_DAY_LOOKBACK = 60;

/**
 * O dia anterior a `dateKey` que **contava** — folga (fim de semana pausado ou
 * dia livre) fica de fora, igual em `allDays()`. `null` se não houver nenhum
 * dentro de `COUNTING_DAY_LOOKBACK` dias, ou antes de `notBefore` (o começo do
 * período; antes disso o app nem existia pro usuário).
 *
 * É o que a skill Recomeço usa pra saber que o dia de hoje é uma volta: o último
 * dia que contava ficou em branco. Folga no meio não conta como sumiço — quem
 * cuida disso é a Descansado.
 */
export function previousCountingDay(
  dateKey: DateKey,
  isRestDay: (key: DateKey) => boolean,
  opts: { notBefore?: DateKey | null; lookback?: number } = {},
): DateKey | null {
  const d = dateFromKey(dateKey);
  for (let i = 0; i < (opts.lookback ?? COUNTING_DAY_LOOKBACK); i++) {
    d.setDate(d.getDate() - 1);
    const key = dk(d);
    if (opts.notBefore && key < opts.notBefore) return null;
    if (!isRestDay(key)) return key;
  }
  return null;
}

/** A DateKey do dia anterior. */
export function previousDayKey(dateKey: DateKey): DateKey {
  const d = dateFromKey(dateKey);
  d.setDate(d.getDate() - 1);
  return dk(d);
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
  /** Último dia que JÁ estava creditado: os dias novos são `(from, processedUntil]`. */
  from: DateKey;
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
    return resetXp ? { gains: {}, from, processedUntil: from, resetXp: true } : null;
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

  return { gains, from, processedUntil: endKey, resetXp };
}
