// Casos de uso dos pets: XP pendente, saldo, adotar (com nome), equipar, skills,
// renomear e evoluir. Pet aqui é sempre a instância adotada (ver domain/pets.ts).

import { computePendingPetXP, isDayClosed } from '../domain/checks';
import { emptyPets } from '../domain/persistence';
import { PETS, coinBalance as coinBalanceOf, evolve, newPetInstance, normalizePetName, petForm } from '../domain/pets';
import type { EvolveRefusal } from '../domain/pets';
import { dk } from '../domain/time';
import type { PetId, PetInstance, PetInstanceId, SkillId } from '../domain/types';
import { notify, state } from '../store/store';
import { computeStatsNow, generateBlocks, getEventsForDate } from './plan';
import { scheduleSave } from './save';

export const petById = (id: PetInstanceId | null | undefined): PetInstance | null =>
  (id && state.pets.owned.find((p) => p.id === id)) || null;

/** O pet equipado agora, ou null. */
export const activePet = (): PetInstance | null => petById(state.pets.active);

/**
 * Credita nos pets o XP dos dias que já fecharam. Idempotente — pode rodar no
 * boot, ao abrir o perfil e ao encerrar o dia. Só o pet equipado NO CHECK ganha.
 * Atenção: usa a config atual sem o almoço editado do dia — como o original.
 */
export function applyPendingPetXP(now: Date = new Date()): void {
  if (!state.pets) state.pets = emptyPets();
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
  if (pending.resetXp) for (const p of state.pets.owned) p.xp = 0;
  for (const id of Object.keys(pending.gains)) {
    const pet = petById(id);
    if (pet) pet.xp = (pet.xp || 0) + pending.gains[id]!;
  }
  state.pets.xpProcessedUntil = pending.processedUntil;
  scheduleSave();
}

export function coinBalance(now: Date = new Date()): number {
  return coinBalanceOf(computeStatsNow(now).coins, state.coinsSpent);
}

export type BuyResult = 'ok' | 'unknown' | 'insufficient' | 'invalid-name';

/**
 * Adotar: gasta as moedas, cria a instância com o nome escolhido e já equipa.
 * Pode adotar a mesma espécie de novo — é outro pet, com outro nome.
 */
export function buyPet(speciesId: PetId, rawName: string, now: Date = new Date()): BuyResult {
  const species = PETS[speciesId];
  if (!species) return 'unknown';
  const name = normalizePetName(rawName);
  if (!name) return 'invalid-name';
  if (coinBalance(now) < species.price) return 'insufficient';
  const pet = newPetInstance(species, name, state.pets.owned, now.getTime());
  state.pets.owned.push(pet);
  state.pets.active = pet.id;
  state.pets.activeSince = now.getTime();
  state.coinsSpent = (state.coinsSpent || 0) + species.price;
  scheduleSave();
  return 'ok';
}

/** Equipar é grátis e instantâneo; clicar no equipado desequipa. */
export function toggleEquip(id: PetInstanceId, now: Date = new Date()): void {
  if (!petById(id)) return;
  if (state.pets.active === id) {
    state.pets.active = null;
  } else {
    state.pets.active = id;
    state.pets.activeSince = now.getTime();
  }
  scheduleSave();
}

/**
 * Uma skill ativa por pet, e só das que a forma atual tem. Clicar na ativa
 * desliga; clicar em outra troca. `skillActivatedAt` marca a troca — o bônus só
 * vale pra blocos que começam depois.
 */
export function toggleSkill(id: PetInstanceId, skillId: SkillId, now: Date = new Date()): void {
  const pet = petById(id);
  if (!pet || !petForm(pet).skills.includes(skillId)) return;
  pet.skill = pet.skill === skillId ? null : skillId;
  pet.skillActivatedAt = now.getTime();
  scheduleSave();
  notify();
}

/** Renomear é grátis. Devolve `false` se o nome não serve. */
export function renamePet(id: PetInstanceId, rawName: string): boolean {
  const pet = petById(id);
  const name = normalizePetName(rawName);
  if (!pet || !name) return false;
  pet.name = name;
  scheduleSave();
  notify();
  return true;
}

export type EvolveResult = 'ok' | 'unknown' | EvolveRefusal;

/** Evolui o pet (escolhendo o caminho, se for a primeira vez). Definitivo. */
export function evolvePet(id: PetInstanceId, pathId?: string): EvolveResult {
  const idx = state.pets.owned.findIndex((p) => p.id === id);
  const pet = state.pets.owned[idx];
  if (!pet) return 'unknown';
  const r = evolve(pet, pathId);
  if (!r.ok) return r.reason;
  state.pets.owned[idx] = r.pet;
  scheduleSave();
  notify();
  return 'ok';
}
