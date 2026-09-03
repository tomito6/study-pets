// Caso de uso: marcar/desmarcar um bloco.

import { canToggleCheck } from '../domain/checks';
import { bonusForCheck, coinsForBlock, xpFromCheck } from '../domain/progression';
import { timeToMins } from '../domain/time';
import type { CheckRecord, DateKey, StudyBlock, TimeString } from '../domain/types';
import { state } from '../store/store';
import { activePet } from './pets';
import { blocksForDay } from './plan';
import { scheduleSave } from './save';

export interface CheckResult {
  /** Estado depois do toggle. */
  checked: boolean;
  /** XP efetivo do check (já com bônus de skill), pro feedback visual. */
  xp: number;
  coins: number;
}

/** Quantos estudos/eventos do dia já estão marcados. */
function studiesChecked(dateKey: DateKey, day: Record<TimeString, CheckRecord>): number {
  return blocksForDay(dateKey).filter((b) => (b.type === 'estudo' || b.type === 'event') && day[b.time]).length;
}

/**
 * Marca ou desmarca o bloco. Devolve `null` se o dia não aceita mudança (encerrado
 * ou futuro). Ao marcar, grava o pet equipado e o bônus decidido AGORA — o XP do
 * pet é creditado só quando o dia fechar (ver `computePendingPetXP`).
 */
export function toggleBlockCheck(dateKey: DateKey, block: StudyBlock, now: Date = new Date()): CheckResult | null {
  if (!canToggleCheck(dateKey, { closedDays: state.closedDays, now })) return null;

  const day = state.checks[dateKey] ?? (state.checks[dateKey] = {});
  const dur = timeToMins(block.endTime) - timeToMins(block.time);

  if (day[block.time]) {
    delete day[block.time];
    if (Object.keys(day).length === 0) delete state.checks[dateKey];
    scheduleSave();
    return { checked: false, xp: 0, coins: 0 };
  }

  const pet = activePet();
  const bonus = bonusForCheck(block, dateKey, {
    activeSkill: pet?.skill ?? null,
    // A skill vale desde a troca dela OU desde que o pet foi equipado — o mais recente.
    activatedAt: Math.max(pet?.skillActivatedAt ?? 0, state.pets.activeSince ?? 0),
    studiesCheckedToday: studiesChecked(dateKey, day),
    now,
  });
  const record = { pet: pet?.id ?? null, bonus };
  day[block.time] = record;
  scheduleSave();
  return { checked: true, xp: xpFromCheck(block, record), coins: coinsForBlock(block, dur) };
}
