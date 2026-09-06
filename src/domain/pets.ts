// Os pets: o catálogo (espécies, formas, caminhos de evolução), a curva de nível,
// o nome e as regras de evolução. Puro.
//
// Espécie é o que a loja vende; forma é o que aparece na tela (sprite + skills);
// instância é o pet adotado, com nome e XP. Adicionar um pet = uma forma + uma
// espécie aqui, e os sprites em public/idle/pets/{form}/. Sem sprite, a UI mostra
// o emoji — dá pra cadastrar antes da arte existir.

import type { EvolutionPath, FormId, PetForm, PetId, PetInstance, PetSpecies } from './types';

const spriteOf = (form: FormId) => (i: number) => `idle/pets/${form}/${i}.png`;

const form = (id: FormId, name: string, emoji: string, skills: string[]): PetForm => ({ id, name, emoji, frames: 4, sprite: spriteOf(id), skills });

/**
 * Toda forma que aparece na tela. Ao longo de um caminho, a forma seguinte
 * **herda** as skills da anterior e ganha uma — evoluir nunca tira skill
 * (teste garante). Os caminhos "selvagem"/"mítico" puxam pras skills de horário
 * (noturno, lua cheia, madrugador); os de "companhia" pras de rotina.
 */
export const FORMS: Record<FormId, PetForm> = {
  // cachorro
  dog: form('dog', 'Cachorro', '🐶', ['fiel']),
  'dog-shepherd': form('dog-shepherd', 'Pastor alemão', '🐕', ['fiel', 'aula']),
  'dog-legend': form('dog-legend', 'Cão lendário', '🦮', ['fiel', 'aula', 'constancia']),
  wolf: form('wolf', 'Lobo', '🐺', ['noturno', 'lua-cheia']),
  'wolf-lunar': form('wolf-lunar', 'Lobo lunar', '🌙', ['noturno', 'lua-cheia', 'madrugador']),
  // gato
  cat: form('cat', 'Gato', '🐱', ['preguica']),
  'cat-egyptian': form('cat-egyptian', 'Gato egípcio', '🐈‍⬛', ['preguica', 'aula']),
  sphinx: form('sphinx', 'Esfinge', '🦁', ['preguica', 'aula', 'constancia']),
  lynx: form('lynx', 'Lince', '🐈', ['preguica', 'noturno']),
  tiger: form('tiger', 'Tigre', '🐯', ['preguica', 'noturno', 'lua-cheia']),
  // cobra
  snake: form('snake', 'Cobra', '🐍', ['constancia']),
  naja: form('naja', 'Naja', '🐍', ['constancia', 'rumina']),
  basilisk: form('basilisk', 'Basilisco', '👑', ['constancia', 'rumina', 'aula']),
  'snake-wyrm': form('snake-wyrm', 'Serpe', '🐉', ['constancia', 'noturno']),
  dragon: form('dragon', 'Dragão', '🐲', ['constancia', 'noturno', 'lua-cheia']),
  // vaca
  cow: form('cow', 'Vaca', '🐮', ['rumina']),
  'cow-prize': form('cow-prize', 'Vaca premiada', '🐄', ['rumina', 'fiel']),
  'cow-golden': form('cow-golden', 'Vaca dourada', '🏆', ['rumina', 'fiel', 'constancia']),
  bull: form('bull', 'Touro', '🐂', ['rumina', 'madrugador']),
  bison: form('bison', 'Bisão', '🦬', ['rumina', 'madrugador', 'noturno']),
  // pomba
  dove: form('dove', 'Pomba', '🕊️', ['madrugador', 'aula']),
  'dove-fire': form('dove-fire', 'Pássaro de fogo', '🔥', ['madrugador', 'aula', 'lua-cheia']),
  phoenix: form('phoenix', 'Fênix', '🐦‍🔥', ['madrugador', 'aula', 'lua-cheia', 'constancia']),
  falcon: form('falcon', 'Falcão', '🦅', ['madrugador', 'aula', 'fiel']),
  eagle: form('eagle', 'Águia', '🦅', ['madrugador', 'aula', 'fiel', 'constancia']),
};

/**
 * Os níveis dos dois estágios de todo caminho. O primeiro (a escolha) é 5
 * (320 XP ≈ 2h40 de estudo com o pet equipado — cedo o bastante pra dar senso de
 * evolução). O segundo é 15 (2520 XP ≈ 21h — umas três semanas de uso com o
 * mesmo pet). IDEIAS.md falava em Lv. 30 pra transformação; 15 é a metade, pela
 * mesma razão que a escolha desceu de 10 pra 5.
 */
export const EVOLVE_LEVELS: readonly [number, number] = [5, 15];

const twoStages = (id: string, name: string, desc: string, first: FormId, second: FormId): EvolutionPath => ({
  id,
  name,
  desc,
  stages: [
    { level: EVOLVE_LEVELS[0], form: first },
    { level: EVOLVE_LEVELS[1], form: second },
  ],
});

/** Toda espécie tem dois caminhos, cada um com dois estágios (Lv. 5 e Lv. 15). */
export const PETS: Record<PetId, PetSpecies> = {
  dog: {
    id: 'dog',
    price: 150,
    form: 'dog',
    names: ['Bolt', 'Thor', 'Mel', 'Pipoca', 'Rex', 'Luna', 'Caramelo', 'Nico'],
    paths: [
      twoStages('companheiro', 'Companheiro', 'Continua cachorro e cresce: pastor alemão, depois o cão lendário — o veterano da rotina.', 'dog-shepherd', 'dog-legend'),
      twoStages('selvagem', 'Selvagem', 'Atende ao chamado: vira lobo, depois lobo lunar — mais forte à noite.', 'wolf', 'wolf-lunar'),
    ],
  },
  cat: {
    id: 'cat',
    price: 150,
    form: 'cat',
    names: ['Mia', 'Tom', 'Frida', 'Nina', 'Simba', 'Jade', 'Luna', 'Salem'],
    paths: [
      twoStages('sabio', 'Sábio', 'Guardião de templos: gato egípcio, depois esfinge — a que guarda os enigmas.', 'cat-egyptian', 'sphinx'),
      twoStages('selvagem', 'Selvagem', 'Volta pra mata: lince, depois tigre.', 'lynx', 'tiger'),
    ],
  },
  snake: {
    id: 'snake',
    price: 150,
    form: 'snake',
    names: ['Sibila', 'Ísis', 'Ônix', 'Zig', 'Medusa', 'Naja'],
    paths: [
      twoStages('ancestral', 'Ancestral', 'Ergue o capuz: naja, depois basilisco — a serpente coroada.', 'naja', 'basilisk'),
      twoStages('mitico', 'Mítico', 'Cria chifres e escamas de brasa: serpe, depois dragão.', 'snake-wyrm', 'dragon'),
    ],
  },
  cow: {
    id: 'cow',
    price: 150,
    form: 'cow',
    names: ['Mimosa', 'Malhada', 'Berta', 'Estrela', 'Dona', 'Preta'],
    paths: [
      twoStages('campea', 'Campeã', 'Estrela da feira: vaca premiada, depois vaca dourada.', 'cow-prize', 'cow-golden'),
      twoStages('selvagem', 'Selvagem', 'Sai do pasto: touro, depois bisão.', 'bull', 'bison'),
    ],
  },
  dove: {
    id: 'dove',
    price: 150,
    form: 'dove',
    names: ['Paz', 'Alva', 'Nuvem', 'Cora', 'Pipo', 'Branca'],
    paths: [
      twoStages('solar', 'Solar', 'Voa pro sol: pássaro de fogo, depois fênix.', 'dove-fire', 'phoenix'),
      twoStages('rapina', 'Rapina', 'Vira ave de rapina: falcão, depois águia.', 'falcon', 'eagle'),
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
  /** O estágio seguinte do caminho (o que vem depois desta escolha), se houver. */
  next: { form: PetForm; level: number } | null;
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
      if (!form) continue;
      const second = path.stages[1];
      const nextForm = second && FORMS[second.form];
      options.push({ path, form, next: second && nextForm ? { form: nextForm, level: second.level } : null });
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

/** O pet pode evoluir agora — chegou no nível e há uma escolha ou um avanço esperando. */
export function canEvolveNow(pet: PetInstance): boolean {
  const evo = evolutionOf(pet);
  return !!evo && evo.kind !== 'locked';
}

/** Os pets adotados que podem evoluir agora, na ordem de `owned`. É o que o Perfil sinaliza. */
export const petsReadyToEvolve = (owned: readonly PetInstance[]): PetInstance[] => owned.filter(canEvolveNow);

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
 * Espécies que mudaram de id. O id antigo continua nos docs salvos (e como id de
 * instância nos checks); a leitura traduz. A coruja virou pomba em 2026-09-03.
 */
export const SPECIES_RENAMES: Readonly<Record<string, PetId>> = { owl: 'dove' };

/**
 * Deixa uma instância coerente com o catálogo atual: traduz espécie renomeada e
 * desliga skill que a forma atual não tem. Puro; devolve a mesma referência se
 * nada mudou.
 */
export function normalizePetInstance(pet: PetInstance): PetInstance {
  const species = SPECIES_RENAMES[pet.species] ?? pet.species;
  let next = species === pet.species ? pet : { ...pet, species };
  if (next.skill && !petForm(next).skills.includes(next.skill)) next = { ...next, skill: null };
  return next;
}

/**
 * Instância a partir do formato antigo, em que `owned` era só o id da espécie.
 * O id continua sendo o da espécie: assim todo check antigo (`pet: 'cat'`)
 * continua apontando pro bicho certo, sem reescrever checks.
 */
export function legacyPetInstance(speciesId: PetId, xp: number, skill: string | null, skillActivatedAt: number): PetInstance {
  const pet = normalizePetInstance({ id: speciesId, species: speciesId, name: '', xp, path: null, stage: 0, skill, skillActivatedAt, adoptedAt: 0 });
  const def = PETS[pet.species];
  return { ...pet, name: def ? speciesForm(def).name : speciesId };
}

/** Saldo = ganho − gasto, nunca negativo. */
export const coinBalance = (earned: number, spent: number): number => Math.max(0, earned - (spent || 0));

/** "3h20min", "2h", "0h" — como aparece no card de estudo do perfil. */
export function formatStudyHours(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m > 0 ? `${m}min` : ''}`;
}
