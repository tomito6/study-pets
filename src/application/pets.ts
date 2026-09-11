// Casos de uso dos pets: XP pendente, saldo, adotar (com nome), equipar, skills,
// renomear e evoluir. Pet aqui é sempre a instância adotada (ver domain/pets.ts).

import { computePendingPetXP, isDayClosed } from '../domain/checks';
import { emptyPets } from '../domain/persistence';
import { PETS, canEvolveNow, coinBalance as coinBalanceOf, evolve, newPetInstance, normalizePetName, petForm, petLevel } from '../domain/pets';
import type { EvolveRefusal } from '../domain/pets';
import { creditedDaysNotices, petNotices } from '../domain/progressNotices';
import type { CreditedDay, PetProgress } from '../domain/progressNotices';
import { dateFromKey, dk } from '../domain/time';
import type { DateKey, PetId, PetInstance, PetInstanceId, SkillId } from '../domain/types';
import { notify, state } from '../store/store';
import { pushNotifications } from './notifications';
import { blocksForDay, calcStreaksNow, computeStatsNow } from './plan';
import { scheduleSave } from './save';

export const petById = (id: PetInstanceId | null | undefined): PetInstance | null =>
  (id && state.pets.owned.find((p) => p.id === id)) || null;

/** O pet equipado agora, ou null. */
export const activePet = (): PetInstance | null => petById(state.pets.active);

/**
 * Credita nos pets o XP dos dias que já fecharam. Idempotente — pode rodar no
 * boot, ao abrir o perfil e ao encerrar o dia. Só o pet equipado NO CHECK ganha.
 * Os blocos de cada dia são os mesmos que a UI e as estatísticas veem
 * (`blocksForDay`: eventos e janelas daquele dia incluídos) — senão um check
 * num horário que só existe com as janelas daquele dia não bateria com nada.
 */
/** O retrato dos pets pro diff de nível/evolução (ver domain/progressNotices.ts). */
const petProgress = (): PetProgress[] =>
  state.pets.owned.map((p) => ({ id: p.id, name: p.name, level: petLevel(p), canEvolve: canEvolveNow(p) }));

/**
 * As notificações dos dias que acabaram de entrar na conta — `(from, until]`, a
 * mesma janela que o XP dos pets acabou de percorrer.
 *
 * Este é o caminho por onde passam AS DUAS formas de um dia entrar na conta: o
 * botão "Encerrar o dia" (que chama `applyPendingPetXP` logo depois de fechar) e
 * a virada da meia-noite, descoberta no boot seguinte. A segunda é a comum — a
 * pessoa fecha o laptop — e era a que não tinha tela nenhuma contando.
 */
function creditedDays(from: DateKey, until: DateKey, now: Date): CreditedDay[] {
  if (from >= until) return [];
  const stats = computeStatsNow(now);
  return Object.keys(stats.dayXP)
    .filter((k) => k > from && k <= until)
    .sort()
    .map((k) => ({
      dia: k,
      xp: stats.dayXP[k] ?? 0,
      coins: stats.dayCoins[k] ?? 0,
      mins: stats.dayStudyDoneMins[k] ?? 0,
      // A sequência ancorada NAQUELE dia, não em hoje: voltar depois de uma semana
      // fora tem que contar o marco do dia em que ele aconteceu.
      streak: calcStreaksNow(stats.dayStudyMins, dateFromKey(k)).cur,
    }));
}

export function applyPendingPetXP(now: Date = new Date()): void {
  if (!state.pets) state.pets = emptyPets();
  const antes = petProgress();
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const pending = computePendingPetXP({
    checks: state.checks,
    xpProcessedUntil: state.pets.xpProcessedUntil,
    todayKey: dk(now),
    yesterdayKey: dk(yest),
    dayClosed: (k) => isDayClosed(state.closedDays, k),
    getBlocks: blocksForDay,
  });
  if (!pending) return;
  if (pending.resetXp) for (const p of state.pets.owned) p.xp = 0;
  for (const id of Object.keys(pending.gains)) {
    const pet = petById(id);
    if (pet) pet.xp = (pet.xp || 0) + pending.gains[id]!;
  }
  state.pets.xpProcessedUntil = pending.processedUntil;
  // A primeira execução sem nada a creditar não grava: numa conta nova, salvar aqui
  // criaria o documento antes do onboarding terminar — e um reload pularia o
  // onboarding (e o pet inicial). O marcador vai junto com o próximo save.
  if (!pending.resetXp || Object.keys(pending.gains).length > 0) scheduleSave();
  // O que aconteceu vai pro sininho: o pet que subiu de nível (ou destravou uma
  // evolução) e os dias que entraram na conta. Os ids derivam do acontecimento,
  // então o dispositivo que já registrou — ou um boot a mais — não duplica nada.
  const dias = creditedDays(pending.from, pending.processedUntil, now);
  const stats = computeStatsNow(now);
  const novos = new Set(dias.map((d) => d.dia));
  const melhorAntes = Object.entries(stats.dayXP)
    .filter(([k]) => !novos.has(k))
    .reduce((m, [, xp]) => Math.max(m, xp), 0);
  pushNotifications(
    [
      ...petNotices(antes, petProgress(), pending.processedUntil),
      ...creditedDaysNotices(dias, {
        totalXP: stats.totalXP,
        bestDayXPBefore: melhorAntes,
        studyMinsAfter: stats.studyMins,
      }),
    ],
    now,
  );
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

export type StarterResult = 'ok' | 'unknown' | 'invalid-name' | 'already-has-pet';

/** Alguém sem pet nenhum ganha um de graça no onboarding (conta nova, ou depois de cancelar a sessão). */
export const needsStarter = (): boolean => state.pets.owned.length === 0;

/**
 * O pet inicial: qualquer espécie do catálogo, de graça, uma vez — só enquanto o
 * usuário não tem pet nenhum. Já nasce equipado.
 */
export function adoptStarter(speciesId: PetId, rawName: string, now: Date = new Date()): StarterResult {
  if (!needsStarter()) return 'already-has-pet';
  const species = PETS[speciesId];
  if (!species) return 'unknown';
  const name = normalizePetName(rawName);
  if (!name) return 'invalid-name';
  const pet = newPetInstance(species, name, state.pets.owned, now.getTime());
  state.pets.owned.push(pet);
  state.pets.active = pet.id;
  state.pets.activeSince = now.getTime();
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
