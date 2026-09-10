// O resumo ao encerrar o dia: o que o usuário e os pets ganharam entre dois
// instantâneos (antes e depois de fechar). Puro.

import { canEvolveNow, petLevelFromXP } from './pets';
import { LEVELS } from './progression';
import type { PetInstance, PetInstanceId } from './types';

export interface ProgressSnapshot {
  totalXP: number;
  coins: number;
  userLevelIdx: number;
  /** XP por pet adotado (id da instância). */
  petXP: Record<PetInstanceId, number>;
}

export interface PetGain {
  id: PetInstanceId;
  gain: number;
  oldLevel: number;
  newLevel: number;
  levelUp: boolean;
  /** Com o XP de hoje o pet chegou no nível de uma evolução que estava trancada. */
  evolutionUnlocked: boolean;
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
  /** As pausas do timer no dia (só aparece se houve alguma). */
  pauses?: { count: number; mins: number };
}

/**
 * `owned` são as instâncias depois de creditar: é delas que sai se a evolução
 * destravou hoje (o snapshot só tem XP). Sem elas, `evolutionUnlocked` fica falso.
 */
export function daySummary(
  before: ProgressSnapshot,
  after: ProgressSnapshot,
  owned: readonly PetInstance[] = [],
  pauses?: { count: number; mins: number },
): DaySummary {
  const pets: PetGain[] = [];
  for (const id of Object.keys(after.petXP)) {
    const oldXP = before.petXP[id] || 0;
    const newXP = after.petXP[id] || 0;
    const gain = newXP - oldXP;
    if (gain <= 0) continue;
    const oldLevel = petLevelFromXP(oldXP);
    const newLevel = petLevelFromXP(newXP);
    const inst = owned.find((p) => p.id === id);
    const evolutionUnlocked = !!inst && canEvolveNow({ ...inst, xp: newXP }) && !canEvolveNow({ ...inst, xp: oldXP });
    pets.push({ id, gain, oldLevel, newLevel, levelUp: newLevel > oldLevel, evolutionUnlocked });
  }
  const userXP = after.totalXP - before.totalXP;
  const userCoins = after.coins - before.coins;
  const out: DaySummary = {
    userXP,
    userCoins,
    userLevelUp: after.userLevelIdx > before.userLevelIdx,
    newLevel: after.userLevelIdx + 1,
    newLevelName: LEVELS[after.userLevelIdx]?.[1] ?? '',
    pets,
    empty: userXP === 0 && userCoins === 0 && pets.length === 0,
  };
  if (pauses && pauses.count > 0) out.pauses = pauses;
  return out;
}
