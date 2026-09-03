// Os pets: o catálogo e as regras de XP/nível/moedas. Puro.
//
// Adicionar um pet = colocar os sprites em public/idle/pets/{id}/ e uma entrada
// aqui. Sem sprite, a UI mostra o emoji — dá pra cadastrar antes da arte existir.

import type { PetsState } from './persistence';
import { LEVELS, getLevelIdx } from './progression';
import type { PetDefinition, PetId } from './types';

export const PETS: Record<PetId, PetDefinition> = {
  cat: { id: 'cat', name: 'Gato', emoji: '🐱', price: 150, frames: 4, sprite: (i) => `idle/pets/cat/${i}.png` },
  cow: { id: 'cow', name: 'Vaca', emoji: '🐮', price: 150, frames: 4, sprite: (i) => `idle/pets/cow/${i}.png` },
  snake: { id: 'snake', name: 'Cobra', emoji: '🐍', price: 150, frames: 4, sprite: (i) => `idle/pets/snake/${i}.png` },
  owl: {
    id: 'owl',
    name: 'Coruja',
    emoji: '🦉',
    price: 150,
    frames: 4,
    sprite: (i) => `idle/pets/owl/${i}.png`,
    skills: [
      { id: 'noturno', name: 'Noturno', desc: '+5% XP em estudos a partir das 18h' },
      { id: 'voo', name: 'Voo', desc: 'Permite o usuário voar (placeholder)' },
    ],
  },
  dog: { id: 'dog', name: 'Cachorro', emoji: '🐶', price: 150, frames: 4, sprite: (i) => `idle/pets/dog/${i}.png` },
};

export const PET_LIST: PetDefinition[] = Object.values(PETS);

export const petXP = (pets: Pick<PetsState, 'xp'>, id: PetId): number => (pets.xp && pets.xp[id]) || 0;

/** Nível do pet (1-based), na mesma escala de XP do usuário. */
export const petLevel = (pets: Pick<PetsState, 'xp'>, id: PetId): number => getLevelIdx(petXP(pets, id)) + 1;

export interface PetProgress {
  xp: number;
  level: number;
  /** 0–100 dentro do nível atual; 100 no máximo. */
  pct: number;
  /** XP do próximo nível, ou null no máximo. */
  nextThreshold: number | null;
  remaining: number;
}

export function petProgress(pets: Pick<PetsState, 'xp'>, id: PetId): PetProgress {
  const xp = petXP(pets, id);
  const level = petLevel(pets, id);
  const cur = LEVELS[level - 1]?.[0] ?? 0;
  const next = LEVELS[level]?.[0] ?? null;
  if (next === null) return { xp, level, pct: 100, nextThreshold: null, remaining: 0 };
  return {
    xp,
    level,
    pct: Math.min(100, Math.round(((xp - cur) / (next - cur)) * 100)),
    nextThreshold: next,
    remaining: next - xp,
  };
}

/** Saldo = ganho − gasto, nunca negativo. */
export const coinBalance = (earned: number, spent: number): number => Math.max(0, earned - (spent || 0));

/** "3h20min", "2h", "0h" — como aparece no card de estudo do perfil. */
export function formatStudyHours(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m > 0 ? `${m}min` : ''}`;
}
