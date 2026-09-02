// Caso de uso: marcar/desmarcar um bloco.

import { canToggleCheck } from '../domain/checks';
import { bonusForCheck, coinsForBlock, xpFromCheck } from '../domain/progression';
import { timeToMins } from '../domain/time';
import type { DateKey, StudyBlock } from '../domain/types';
import { state } from '../store/store';
import { scheduleSave } from './save';

export interface CheckResult {
  /** Estado depois do toggle. */
  checked: boolean;
  /** XP efetivo do check (já com bônus de skill), pro feedback visual. */
  xp: number;
  coins: number;
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

  const bonus = bonusForCheck(block, dateKey, {
    activePet: state.pets.active || null,
    owlSkill: state.skills?.owl ?? null,
    activatedAt: state.skills?.activatedAt ?? 0,
    now,
  });
  const record = { pet: state.pets.active || null, bonus };
  day[block.time] = record;
  scheduleSave();
  return { checked: true, xp: xpFromCheck(block, record), coins: coinsForBlock(block, dur) };
}
