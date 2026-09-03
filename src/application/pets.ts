// Casos de uso dos pets: XP pendente, saldo, adotar, equipar, skills.

import { computePendingPetXP } from '../domain/checks';
import { isDayClosed } from '../domain/checks';
import { PETS, coinBalance as coinBalanceOf } from '../domain/pets';
import { dk } from '../domain/time';
import type { PetId } from '../domain/types';
import { notify, state } from '../store/store';
import { computeStatsNow, generateBlocks, getEventsForDate } from './plan';
import { scheduleSave } from './save';

/**
 * Credita nos pets o XP dos dias que já fecharam. Idempotente — pode rodar no
 * boot, ao abrir o perfil e ao encerrar o dia. Só o pet equipado NO CHECK ganha.
 * Atenção: usa a config atual sem o almoço editado do dia — como o original.
 */
export function applyPendingPetXP(now: Date = new Date()): void {
  if (!state.pets) state.pets = { owned: [], active: null, xp: {}, xpProcessedUntil: null };
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const pending = computePendingPetXP({
    checks: state.checks,
    xpProcessedUntil: state.pets.xpProcessedUntil,
    todayKey: dk(now),
    yesterdayKey: dk(yest),
    dayClosed: (k) => isDayClosed(state.closedDays, k),
    getBlocks: (dayKey) => generateBlocks(state.config, getEventsForDate(dayKey)),
  });
  if (!pending) return;
  if (pending.resetXp) state.pets.xp = {};
  if (!state.pets.xp) state.pets.xp = {};
  for (const petId of Object.keys(pending.gains)) {
    state.pets.xp[petId] = (state.pets.xp[petId] || 0) + pending.gains[petId]!;
  }
  state.pets.xpProcessedUntil = pending.processedUntil;
  scheduleSave();
}

export function coinBalance(now: Date = new Date()): number {
  return coinBalanceOf(computeStatsNow(now).coins, state.coinsSpent);
}

export type BuyResult = 'ok' | 'unknown' | 'owned' | 'insufficient';

/** Adotar: gasta as moedas, adiciona e já equipa. */
export function buyPet(petId: PetId): BuyResult {
  const pet = PETS[petId];
  if (!pet) return 'unknown';
  if (state.pets.owned.includes(pet.id)) return 'owned';
  if (coinBalance() < pet.price) return 'insufficient';
  state.pets.owned.push(pet.id);
  state.pets.active = pet.id;
  state.coinsSpent = (state.coinsSpent || 0) + pet.price;
  scheduleSave();
  return 'ok';
}

/** Equipar é grátis e instantâneo; clicar no equipado desequipa. */
export function toggleEquip(petId: PetId): void {
  if (!state.pets.owned.includes(petId)) return;
  state.pets.active = state.pets.active === petId ? null : petId;
  scheduleSave();
}

/**
 * Uma skill ativa por pet. Clicar na ativa desliga; clicar em outra troca.
 * `activatedAt` marca a troca — o bônus só vale pra blocos que começam depois.
 */
export function toggleSkill(petId: PetId, skillId: string, now: Date = new Date()): void {
  if (!state.skills) state.skills = { owl: null, activatedAt: 0 };
  const skills = state.skills as unknown as Record<string, string | number | null>;
  skills[petId] = skills[petId] === skillId ? null : skillId;
  state.skills.activatedAt = now.getTime();
  scheduleSave();
  notify();
}

export const activeSkillOf = (petId: PetId): string | null =>
  ((state.skills as unknown as Record<string, string | null>)?.[petId] as string | null) ?? null;
