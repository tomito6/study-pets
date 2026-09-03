// O resumo ao encerrar o dia: o que o usuário e os pets ganharam entre dois
// instantâneos (antes e depois de fechar). Puro.

import { LEVELS, getLevelIdx } from './progression';
import type { PetId } from './types';

export interface ProgressSnapshot {
  totalXP: number;
  coins: number;
  userLevelIdx: number;
  petXP: Record<PetId, number>;
}

export interface PetGain {
  id: PetId;
  gain: number;
  oldLevel: number;
  newLevel: number;
  levelUp: boolean;
}

export interface DaySummary {
  userXP: number;
  userCoins: number;
  userLevelUp: boolean;
  /** 1-based, como aparece na UI. */
  newLevel: number;
  newLevelName: string;
  pets: PetGain[];
  /** Nada marcado: dia encerrado sem ganhos. */
  empty: boolean;
}

export function daySummary(before: ProgressSnapshot, after: ProgressSnapshot): DaySummary {
  const pets: PetGain[] = [];
  for (const id of Object.keys(after.petXP)) {
    const oldXP = before.petXP[id] || 0;
    const newXP = after.petXP[id] || 0;
    const gain = newXP - oldXP;
    if (gain <= 0) continue;
    const oldLevel = getLevelIdx(oldXP) + 1;
    const newLevel = getLevelIdx(newXP) + 1;
    pets.push({ id, gain, oldLevel, newLevel, levelUp: newLevel > oldLevel });
  }
  const userXP = after.totalXP - before.totalXP;
  const userCoins = after.coins - before.coins;
  return {
    userXP,
    userCoins,
    userLevelUp: after.userLevelIdx > before.userLevelIdx,
    newLevel: after.userLevelIdx + 1,
    newLevelName: LEVELS[after.userLevelIdx]?.[1] ?? '',
    pets,
    empty: userXP === 0 && userCoins === 0 && pets.length === 0,
  };
}
