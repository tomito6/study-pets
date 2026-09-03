// Os pets: o catálogo (espécies, formas, caminhos de evolução), a curva de nível,
// o nome e as regras de evolução. Puro.
//
// Espécie é o que a loja vende; forma é o que aparece na tela (sprite + skills);
// instância é o pet adotado, com nome e XP. Adicionar um pet = uma forma + uma
// espécie aqui, e os sprites em public/idle/pets/{form}/. Sem sprite, a UI mostra
// o emoji — dá pra cadastrar antes da arte existir.

import type { EvolutionPath, FormId, PetForm, PetId, PetInstance, PetSpecies } from './types';

const spriteOf = (form: FormId) => (i: number) => `idle/pets/${form}/${i}.png`;

export const FORMS: Record<FormId, PetForm> = {
  cat: { id: 'cat', name: 'Gato', emoji: '🐱', frames: 4, sprite: spriteOf('cat'), skills: [] },
  cow: { id: 'cow', name: 'Vaca', emoji: '🐮', frames: 4, sprite: spriteOf('cow'), skills: [] },
  snake: { id: 'snake', name: 'Cobra', emoji: '🐍', frames: 4, sprite: spriteOf('snake'), skills: [] },
  owl: { id: 'owl', name: 'Coruja', emoji: '🦉', frames: 4, sprite: spriteOf('owl'), skills: ['noturno', 'voo'] },
  dog: { id: 'dog', name: 'Cachorro', emoji: '🐶', frames: 4, sprite: spriteOf('dog'), skills: ['fiel'] },
  'dog-shepherd': { id: 'dog-shepherd', name: 'Pastor alemão', emoji: '🐕', frames: 4, sprite: spriteOf('dog-shepherd'), skills: ['fiel', 'aula'] },
  wolf: { id: 'wolf', name: 'Lobo', emoji: '🐺', frames: 4, sprite: spriteOf('wolf'), skills: ['noturno', 'lua-cheia'] },
};

/**
 * Nível em que o cachorro escolhe o caminho. Está em 2 pra dar pra testar num
 * dia; o design final é 10 (escolha, mudança pequena) e 30 (transformação) —
 * ver IDEIAS.md, "Pets: nome, evolução…".
 */
export const DOG_EVOLVE_LEVEL = 2;

export const PETS: Record<PetId, PetSpecies> = {
  cat: { id: 'cat', price: 150, form: 'cat', paths: [], names: ['Mia', 'Tom', 'Frida', 'Nina', 'Simba', 'Jade', 'Luna', 'Salem'] },
  cow: { id: 'cow', price: 150, form: 'cow', paths: [], names: ['Mimosa', 'Malhada', 'Berta', 'Estrela', 'Dona', 'Preta'] },
  snake: { id: 'snake', price: 150, form: 'snake', paths: [], names: ['Sibila', 'Ísis', 'Ônix', 'Zig', 'Medusa', 'Naja'] },
  owl: { id: 'owl', price: 150, form: 'owl', paths: [], names: ['Sofia', 'Atena', 'Hugo', 'Merlin', 'Noite', 'Bubo'] },
  dog: {
    id: 'dog',
    price: 150,
    form: 'dog',
    names: ['Bolt', 'Thor', 'Mel', 'Pipoca', 'Rex', 'Luna', 'Caramelo', 'Nico'],
    paths: [
      {
        id: 'companheiro',
        name: 'Companheiro',
        desc: 'Continua cachorro e cresce: vira um pastor alemão, guardião da rotina.',
        stages: [{ level: DOG_EVOLVE_LEVEL, form: 'dog-shepherd' }],
      },
      {
        id: 'selvagem',
        name: 'Selvagem',
        desc: 'Atende ao chamado e vira lobo — mais forte à noite.',
        stages: [{ level: DOG_EVOLVE_LEVEL, form: 'wolf' }],
      },
    ],
  },
};

export const PET_LIST: PetSpecies[] = Object.values(PETS);

const UNKNOWN_FORM: PetForm = { id: '?', name: '?', emoji: '🐾', frames: 1, sprite: () => '', skills: [] };

/** A forma com que a espécie nasce (nome, emoji e sprite da loja). */
export const speciesForm = (s: PetSpecies): PetForm => FORMS[s.form] ?? UNKNOWN_FORM;

// ---------------------------------------------------------------- nível

/**
 * Curva própria do pet: rápida no começo, sem teto. Do nível L pro L+1 custa
 * `50 + 20·(L−1)` XP; a 2 XP/min, o Lv. 2 é um pomo, o Lv. 10 são ~10h, o Lv. 30 ~80h.
 */
export const petXpToNext = (level: number): number => 50 + 20 * (level - 1);

/** XP acumulado em que o nível L começa (Lv. 1 = 0). Forma fechada da soma acima. */
export const petLevelStart = (level: number): number => (level - 1) * (30 + 10 * level);

export function petLevelFromXP(xp: number): number {
  let level = 1;
  while (xp >= petLevelStart(level + 1)) level++;
  return level;
}

export const petLevel = (pet: Pick<PetInstance, 'xp'>): number => petLevelFromXP(pet.xp || 0);

export interface PetProgress {
  xp: number;
  level: number;
  /** 0–100 dentro do nível atual. */
  pct: number;
  /** XP acumulado em que o próximo nível começa. */
  nextThreshold: number;
  remaining: number;
}

export function petProgress(pet: Pick<PetInstance, 'xp'>): PetProgress {
  const xp = pet.xp || 0;
  const level = petLevelFromXP(xp);
  const cur = petLevelStart(level);
  const next = petLevelStart(level + 1);
  return {
    xp,
    level,
    pct: Math.min(100, Math.round(((xp - cur) / (next - cur)) * 100)),
    nextThreshold: next,
    remaining: next - xp,
  };
}

// ---------------------------------------------------------------- forma e evolução

/** A forma atual de um pet: a base da espécie, ou o estágio do caminho escolhido. */
export function petForm(pet: Pick<PetInstance, 'species' | 'path' | 'stage'>): PetForm {
  const species = PETS[pet.species];
  if (!species) return FORMS[pet.species] ?? UNKNOWN_FORM;
  if (pet.stage > 0 && pet.path) {
    const path = species.paths.find((p) => p.id === pet.path);
    const stage = path?.stages[pet.stage - 1];
    const form = stage && FORMS[stage.form];
    if (form) return form;
  }
  return speciesForm(species);
}

export interface EvolutionOption {
  path: EvolutionPath;
  form: PetForm;
}

/**
 * O que a evolução do pet tem pra oferecer agora:
 * - `choose`: chegou no nível e ainda não escolheu caminho — escolha entre `options`;
 * - `advance`: já tem caminho e chegou no próximo estágio;
 * - `locked`: tem evolução pela frente, mas falta nível;
 * - `null`: essa espécie não evolui, ou já chegou ao fim do caminho.
 */
export type Evolution =
  | { kind: 'choose'; level: number; options: EvolutionOption[] }
  | { kind: 'advance'; level: number; form: PetForm }
  | { kind: 'locked'; level: number }
  | null;

export function evolutionOf(pet: PetInstance): Evolution {
  const species = PETS[pet.species];
  if (!species || species.paths.length === 0) return null;
  const level = petLevel(pet);

  if (!pet.path) {
    const options: EvolutionOption[] = [];
    for (const path of species.paths) {
      const first = path.stages[0];
      const form = first && FORMS[first.form];
      if (form) options.push({ path, form });
    }
    if (options.length === 0) return null;
    const at = Math.min(...options.map((o) => o.path.stages[0]!.level));
    return level >= at ? { kind: 'choose', level: at, options } : { kind: 'locked', level: at };
  }

  const path = species.paths.find((p) => p.id === pet.path);
  const next = path?.stages[pet.stage];
  const form = next && FORMS[next.form];
  if (!next || !form) return null;
  return level >= next.level ? { kind: 'advance', level: next.level, form } : { kind: 'locked', level: next.level };
}

export type EvolveRefusal = 'none' | 'not-ready' | 'invalid-path';

/**
 * Evolui o pet: devolve a instância nova (não muta). Nome, XP e nível continuam;
 * só o caminho/estágio muda. Uma skill que a forma nova não tem é desligada.
 */
export function evolve(pet: PetInstance, pathId?: string): { ok: true; pet: PetInstance } | { ok: false; reason: EvolveRefusal } {
  const evo = evolutionOf(pet);
  if (!evo) return { ok: false, reason: 'none' };
  if (evo.kind === 'locked') return { ok: false, reason: 'not-ready' };

  let next: PetInstance;
  if (evo.kind === 'choose') {
    const option = evo.options.find((o) => o.path.id === pathId);
    if (!option) return { ok: false, reason: 'invalid-path' };
    next = { ...pet, path: option.path.id, stage: 1 };
  } else {
    next = { ...pet, stage: pet.stage + 1 };
  }
  if (next.skill && !petForm(next).skills.includes(next.skill)) next = { ...next, skill: null };
  return { ok: true, pet: next };
}

// ---------------------------------------------------------------- nome e instância

export const PET_NAME_MAX = 16;

/** Nome válido: 1–16 caracteres depois de aparar espaços. `null` se não serve. */
export function normalizePetName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > PET_NAME_MAX) return null;
  return name;
}

/** Sugestão de nome pra espécie. `random` é injetável pra ser testável. */
export function suggestPetName(species: PetSpecies, random: () => number = Math.random): string {
  const list = species.names.length ? species.names : [speciesForm(species).name];
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;
}

/**
 * Uma instância nova. O id é o da espécie se estiver livre (`dog`), senão
 * `dog-2`, `dog-3`… — legível no Firestore, e igual ao formato antigo no caso comum.
 */
export function newPetInstance(species: PetSpecies, name: string, existing: readonly PetInstance[], now: number): PetInstance {
  const taken = new Set(existing.map((p) => p.id));
  let id = species.id;
  for (let n = 2; taken.has(id); n++) id = `${species.id}-${n}`;
  return { id, species: species.id, name, xp: 0, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: now };
}

/**
 * Instância a partir do formato antigo, em que `owned` era só o id da espécie.
 * O id continua sendo o da espécie: assim todo check antigo (`pet: 'cat'`)
 * continua apontando pro bicho certo, sem reescrever checks.
 */
export function legacyPetInstance(speciesId: PetId, xp: number, skill: string | null, skillActivatedAt: number): PetInstance {
  const species = PETS[speciesId];
  const name = species ? speciesForm(species).name : speciesId;
  return { id: speciesId, species: speciesId, name, xp, path: null, stage: 0, skill, skillActivatedAt, adoptedAt: 0 };
}

/** Saldo = ganho − gasto, nunca negativo. */
export const coinBalance = (earned: number, spent: number): number => Math.max(0, earned - (spent || 0));

/** "3h20min", "2h", "0h" — como aparece no card de estudo do perfil. */
export function formatStudyHours(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m > 0 ? `${m}min` : ''}`;
}
