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
 * Toda forma que aparece na tela, e as skills que ela pode ter.
 *
 * A escada é sempre a mesma: a **espécie** nasce com 1 skill, a **escolha** do
 * Lv. 5 tem 2 e o **avanço** do Lv. 15 tem 3. O avanço nunca tira skill, só
 * acrescenta; a escolha pode **trocar** a da base, e é isso que faz o caminho
 * selvagem parecer uma transformação (o lobo larga a Fiel) e o de companhia
 * parecer um crescimento (o pastor mantém). Teste garante os dois.
 *
 * Nenhum conjunto se repete entre formas: escolher um caminho é escolher um
 * jeito de estudar, não um sprite. Ver `SKILLS` pra o que cada uma faz e
 * `SKILL_TIERS` pra por que todas valem o mesmo.
 */
export const FORMS: Record<FormId, PetForm> = {
  // cachorro — a rotina: quem te espera todo dia e te traz de volta
  dog: form('dog', 'Cachorro', '🐶', ['fiel']),
  'dog-shepherd': form('dog-shepherd', 'Pastor alemão', '🐕', ['fiel', 'retomada']),
  'dog-legend': form('dog-legend', 'Cão lendário', '🦮', ['fiel', 'retomada', 'constancia']),
  wolf: form('wolf', 'Lobo', '🐺', ['noturno', 'maratona']),
  'wolf-lunar': form('wolf-lunar', 'Lobo lunar', '🌙', ['noturno', 'maratona', 'lua-cheia']),
  // gato — o descanso: a pausa longa e o trecho de estudo com nome
  cat: form('cat', 'Gato', '🐱', ['preguica']),
  'cat-egyptian': form('cat-egyptian', 'Gato egípcio', '🐈‍⬛', ['preguica', 'afinco']),
  sphinx: form('sphinx', 'Esfinge', '🦁', ['preguica', 'afinco', 'empenho']),
  lynx: form('lynx', 'Lince', '🐈', ['preguica', 'noturno']),
  tiger: form('tiger', 'Tigre', '🐯', ['preguica', 'noturno', 'hora-extra']),
  // cobra — a disciplina: a meta, a digestão, o ponto final
  snake: form('snake', 'Cobra', '🐍', ['constancia']),
  naja: form('naja', 'Naja', '🐍', ['constancia', 'rumina']),
  basilisk: form('basilisk', 'Basilisco', '👑', ['constancia', 'rumina', 'ponto-final']),
  'snake-wyrm': form('snake-wyrm', 'Serpe', '🐉', ['lua-cheia', 'maratona']),
  dragon: form('dragon', 'Dragão', '🐲', ['lua-cheia', 'maratona', 'descansado']),
  // vaca — a calma: a refeição, a folga, a força que acorda cedo
  cow: form('cow', 'Vaca', '🐮', ['rumina']),
  'cow-prize': form('cow-prize', 'Vaca premiada', '🐄', ['rumina', 'descansado']),
  'cow-golden': form('cow-golden', 'Vaca dourada', '🏆', ['rumina', 'descansado', 'fiel']),
  bull: form('bull', 'Touro', '🐂', ['madrugador', 'hora-extra']),
  bison: form('bison', 'Bisão', '🦬', ['madrugador', 'hora-extra', 'maratona']),
  // pomba — a aula e o recomeço: o dia de faculdade e o dia em que você volta
  dove: form('dove', 'Pomba', '🕊️', ['aula']),
  'dove-fire': form('dove-fire', 'Pássaro de fogo', '🔥', ['aula', 'recomeco']),
  phoenix: form('phoenix', 'Fênix', '🐦‍🔥', ['aula', 'recomeco', 'descansado']),
  falcon: form('falcon', 'Falcão', '🦅', ['madrugador', 'vespertino']),
  eagle: form('eagle', 'Águia', '🦅', ['madrugador', 'vespertino', 'ponto-final']),
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
      twoStages('companheiro', 'Companheiro', 'Continua cachorro e cresce: pastor alemão, depois cão lendário. Rende nos retornos — o estudo depois da aula, o que bate a meta.', 'dog-shepherd', 'dog-legend'),
      twoStages('selvagem', 'Selvagem', 'Atende ao chamado: vira lobo, depois lobo lunar. Larga a Fiel e vira noite e fôlego — rende da noite em diante e nos dias longos.', 'wolf', 'wolf-lunar'),
    ],
  },
  cat: {
    id: 'cat',
    price: 150,
    form: 'cat',
    names: ['Mia', 'Tom', 'Frida', 'Nina', 'Simba', 'Jade', 'Luna', 'Salem'],
    paths: [
      twoStages('sabio', 'Sábio', 'Guardião de templos: gato egípcio, depois esfinge. Rende dentro dos grupos de estudo — o trecho do dia que tem nome e objetivo.', 'cat-egyptian', 'sphinx'),
      twoStages('selvagem', 'Selvagem', 'Volta pra mata: lince, depois tigre. Mantém a soneca e ganha a noite; no fim, rende também nos dias de folga.', 'lynx', 'tiger'),
    ],
  },
  snake: {
    id: 'snake',
    price: 150,
    form: 'snake',
    names: ['Sibila', 'Ísis', 'Ônix', 'Zig', 'Medusa', 'Naja'],
    paths: [
      twoStages('ancestral', 'Ancestral', 'Ergue o capuz: naja, depois basilisco. Rende nos marcos do dia — a meta, o estudo depois da refeição, o último bloco.', 'naja', 'basilisk'),
      twoStages('mitico', 'Mítico', 'Cria chifres e escamas de brasa: serpe, depois dragão. Larga a Constância e vira noite alta e resistência.', 'snake-wyrm', 'dragon'),
    ],
  },
  cow: {
    id: 'cow',
    price: 150,
    form: 'cow',
    names: ['Mimosa', 'Malhada', 'Berta', 'Estrela', 'Dona', 'Preta'],
    paths: [
      twoStages('campea', 'Campeã', 'Estrela da feira: vaca premiada, depois vaca dourada. Rende na volta da folga e no primeiro estudo do dia.', 'cow-prize', 'cow-golden'),
      twoStages('selvagem', 'Selvagem', 'Sai do pasto: touro, depois bisão. Larga a Rumina: acorda cedo, estuda na folga e aguenta o dia longo.', 'bull', 'bison'),
    ],
  },
  dove: {
    id: 'dove',
    price: 150,
    form: 'dove',
    names: ['Paz', 'Alva', 'Nuvem', 'Cora', 'Pipo', 'Branca'],
    paths: [
      twoStages('solar', 'Solar', 'Voa pro sol: pássaro de fogo, depois fênix. Renasce: rende no dia em que você volta depois de sumir.', 'dove-fire', 'phoenix'),
      twoStages('rapina', 'Rapina', 'Vira ave de rapina: falcão, depois águia. Larga a Aula e vira o dia claro — de manhã cedo à tarde, e o bloco que fecha.', 'falcon', 'eagle'),
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
