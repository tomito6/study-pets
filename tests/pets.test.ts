import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPendingPetXP, buyPet, coinBalance, evolvePet, renamePet, toggleEquip, toggleSkill } from '../src/application/pets';
import { blocksForDay, clearBlockCache, rebuildWeeks } from '../src/application/plan';
import { toggleBlockCheck } from '../src/application/checks';
import { emptyPersistedState } from '../src/domain/persistence';
import {
  DOG_EVOLVE_LEVEL,
  FORMS,
  PETS,
  PET_LIST,
  coinBalance as coinBalanceOf,
  evolutionOf,
  evolve,
  formatStudyHours,
  legacyPetInstance,
  newPetInstance,
  normalizePetName,
  petForm,
  petLevelFromXP,
  petLevelStart,
  petProgress,
  petXpToNext,
  speciesForm,
  suggestPetName,
} from '../src/domain/pets';
import { SKILLS } from '../src/domain/progression';
import type { PetInstance } from '../src/domain/types';
import { derived, state } from '../src/store/store';

const inst = (over: Partial<PetInstance> = {}): PetInstance => ({
  id: 'dog', species: 'dog', name: 'Bolt', xp: 0, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: 0, ...over,
});

describe('catálogo', () => {
  it('5 espécies a 150 moedas; toda forma e skill referenciada existe', () => {
    expect(PET_LIST).toHaveLength(5);
    expect(PET_LIST.every((p) => p.price === 150)).toBe(true);
    for (const s of PET_LIST) {
      expect(FORMS[s.form], s.id).toBeDefined();
      for (const path of s.paths) for (const st of path.stages) expect(FORMS[st.form], st.form).toBeDefined();
    }
    for (const f of Object.values(FORMS)) for (const id of f.skills) expect(SKILLS[id], id).toBeDefined();
    expect(speciesForm(PETS.cat!).sprite(2)).toBe('idle/pets/cat/2.png');
    expect(FORMS.owl!.skills).toEqual(['noturno', 'voo']);
  });

  it('o cachorro tem dois caminhos: pastor alemão ou lobo, no Lv. 5', () => {
    expect(DOG_EVOLVE_LEVEL).toBe(5);
    expect(PETS.dog!.paths.map((p) => p.id)).toEqual(['companheiro', 'selvagem']);
    expect(PETS.dog!.paths.map((p) => p.stages[0]!.form)).toEqual(['dog-shepherd', 'wolf']);
    expect(PETS.dog!.paths.every((p) => p.stages[0]!.level === DOG_EVOLVE_LEVEL)).toBe(true);
  });
});

describe('curva de nível do pet', () => {
  it('rápida no começo, sem teto: Lv. 2 é um pomo, Lv. 10 ~10h, Lv. 30 ~80h', () => {
    expect(petXpToNext(1)).toBe(50);
    expect(petLevelStart(1)).toBe(0);
    expect(petLevelStart(2)).toBe(50);
    expect(petLevelStart(3)).toBe(120);
    expect(petLevelStart(10)).toBe(1170);
    expect(petLevelStart(30)).toBe(9570);
    expect(petLevelFromXP(0)).toBe(1);
    expect(petLevelFromXP(49)).toBe(1);
    expect(petLevelFromXP(50)).toBe(2);
    expect(petLevelFromXP(119)).toBe(2);
    expect(petLevelFromXP(120)).toBe(3);
    expect(petLevelFromXP(1170)).toBe(10);
    expect(petLevelFromXP(9570)).toBe(30);
    expect(petLevelFromXP(100000)).toBeGreaterThan(30);
  });

  it('a forma fechada bate com a soma dos degraus', () => {
    let acc = 0;
    for (let level = 1; level <= 40; level++) {
      expect(petLevelStart(level)).toBe(acc);
      acc += petXpToNext(level);
    }
  });

  it('progresso dentro do nível', () => {
    expect(petProgress({ xp: 0 })).toEqual({ xp: 0, level: 1, pct: 0, nextThreshold: 50, remaining: 50 });
    expect(petProgress({ xp: 85 })).toEqual({ xp: 85, level: 2, pct: 50, nextThreshold: 120, remaining: 35 });
  });
});

describe('forma, nome e evolução (puro)', () => {
  it('forma base, e a forma do estágio depois de evoluir', () => {
    expect(petForm(inst()).id).toBe('dog');
    expect(petForm(inst({ path: 'selvagem', stage: 1 })).id).toBe('wolf');
    expect(petForm(inst({ path: 'companheiro', stage: 1 })).id).toBe('dog-shepherd');
    expect(petForm(inst({ path: 'inexistente', stage: 1 })).id).toBe('dog'); // caminho desconhecido cai na base
    expect(petForm(inst({ species: 'xyz' })).emoji).toBe('🐾');
  });

  it('evolução: trancada antes do nível, escolha no nível, nada depois', () => {
    expect(evolutionOf(inst({ xp: 0 }))).toEqual({ kind: 'locked', level: DOG_EVOLVE_LEVEL });
    const e = evolutionOf(inst({ xp: petLevelStart(DOG_EVOLVE_LEVEL) }));
    expect(e?.kind).toBe('choose');
    expect(e && e.kind === 'choose' ? e.options.map((o) => o.form.id) : []).toEqual(['dog-shepherd', 'wolf']);
    expect(evolutionOf(inst({ xp: 9999, path: 'selvagem', stage: 1 }))).toBeNull(); // fim do caminho
    expect(evolutionOf(inst({ id: 'cat', species: 'cat', xp: 9999 }))).toBeNull(); // gato não evolui
  });

  it('evolve: recusa sem nível ou com caminho inválido; aplica sem mutar; skill que a forma nova não tem cai', () => {
    expect(evolve(inst())).toEqual({ ok: false, reason: 'not-ready' });
    const pronto = inst({ xp: petLevelStart(DOG_EVOLVE_LEVEL), skill: 'fiel' });
    expect(evolve(pronto, 'nada')).toEqual({ ok: false, reason: 'invalid-path' });

    const lobo = evolve(pronto, 'selvagem');
    expect(lobo.ok).toBe(true);
    if (lobo.ok) {
      expect(lobo.pet).toMatchObject({ name: 'Bolt', xp: petLevelStart(DOG_EVOLVE_LEVEL), path: 'selvagem', stage: 1, skill: null });
      expect(petForm(lobo.pet).id).toBe('wolf');
    }
    expect(pronto.stage).toBe(0);

    const pastor = evolve(pronto, 'companheiro');
    if (pastor.ok) expect(pastor.pet.skill).toBe('fiel'); // o pastor alemão ainda tem a Fiel
    expect(evolve(inst({ id: 'cat', species: 'cat', xp: 999 }))).toEqual({ ok: false, reason: 'none' });
  });

  it('nome: apara espaços, 1 a 16 caracteres; sugestão vem da lista da espécie', () => {
    expect(normalizePetName('  Bolt  ')).toBe('Bolt');
    expect(normalizePetName('Dom   Pedro')).toBe('Dom Pedro');
    expect(normalizePetName('   ')).toBeNull();
    expect(normalizePetName('a'.repeat(17))).toBeNull();
    expect(normalizePetName('a'.repeat(16))).toBe('a'.repeat(16));
    expect(suggestPetName(PETS.dog!, () => 0)).toBe('Bolt');
    expect(suggestPetName(PETS.dog!, () => 0.999)).toBe('Nico');
  });

  it('instância nova: id da espécie se livre, senão dog-2, dog-3', () => {
    const a = newPetInstance(PETS.dog!, 'Bolt', [], 1000);
    expect(a).toEqual({ id: 'dog', species: 'dog', name: 'Bolt', xp: 0, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: 1000 });
    const b = newPetInstance(PETS.dog!, 'Thor', [a], 2000);
    expect(b.id).toBe('dog-2');
    expect(newPetInstance(PETS.dog!, 'Rex', [a, b], 3000).id).toBe('dog-3');
  });

  it('instância legada: id = espécie, nome = nome da forma', () => {
    expect(legacyPetInstance('owl', 300, 'noturno', 5)).toEqual({
      id: 'owl', species: 'owl', name: 'Coruja', xp: 300, path: null, stage: 0, skill: 'noturno', skillActivatedAt: 5, adoptedAt: 0,
    });
    expect(legacyPetInstance('dragao', 0, null, 0).name).toBe('dragao');
  });

  it('saldo nunca fica negativo; horas de estudo formatadas', () => {
    expect(coinBalanceOf(100, 150)).toBe(0);
    expect(coinBalanceOf(200, 150)).toBe(50);
    expect(formatStudyHours(200)).toBe('3h20min');
    expect(formatStudyHours(120)).toBe('2h');
    expect(formatStudyHours(0)).toBe('0h');
  });
});

describe('casos de uso dos pets', () => {
  const AGORA = new Date('2026-09-02T17:30:00');
  const HOJE = '2026-09-02';
  const ONTEM = '2026-09-01';
  const ANTEONTEM = '2026-08-31';
  const OITO_DA_MANHA = new Date('2026-09-02T08:00:00').getTime();

  /** 7 estudos num dia passado = 175 moedas + 5 de bônus de streak. */
  const estudarSete = (dia: string) =>
    blocksForDay(dia).filter((b) => b.type === 'estudo').slice(0, 7).forEach((b) => toggleBlockCheck(dia, b, AGORA));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
    derived.weeks = [];
    clearBlockCache();
    rebuildWeeks(AGORA);
  });

  it('não adota sem moedas nem sem nome; adota com moedas, gasta, nomeia e já equipa', () => {
    expect(buyPet('cat', 'Mia')).toBe('insufficient');
    estudarSete(ONTEM);
    expect(coinBalance(AGORA)).toBe(180);
    expect(buyPet('cat', '   ')).toBe('invalid-name');
    expect(buyPet('cat', ' Mia ')).toBe('ok');
    expect(state.pets.owned).toMatchObject([{ id: 'cat', species: 'cat', name: 'Mia', xp: 0, adoptedAt: AGORA.getTime() }]);
    expect(state.pets.active).toBe('cat');
    expect(state.pets.activeSince).toBe(AGORA.getTime());
    expect(state.coinsSpent).toBe(150);
    expect(coinBalance(AGORA)).toBe(30);
    expect(buyPet('cat', 'Tom')).toBe('insufficient');
    expect(buyPet('dragao', 'X')).toBe('unknown');
  });

  it('a segunda cópia da mesma espécie é outra instância, com outro nome', () => {
    estudarSete(ANTEONTEM);
    estudarSete(ONTEM);
    expect(buyPet('dog', 'Bolt')).toBe('ok');
    expect(buyPet('dog', 'Thor')).toBe('ok');
    expect(state.pets.owned.map((p) => [p.id, p.name])).toEqual([['dog', 'Bolt'], ['dog-2', 'Thor']]);
    expect(state.pets.active).toBe('dog-2');
  });

  it('equipar/desequipar é grátis; só pets que você tem; marca desde quando', () => {
    state.pets.owned = [inst({ id: 'cat', species: 'cat' }), inst({ id: 'owl', species: 'owl' })];
    toggleEquip('owl', AGORA);
    expect(state.pets.active).toBe('owl');
    expect(state.pets.activeSince).toBe(AGORA.getTime());
    toggleEquip('owl', AGORA);
    expect(state.pets.active).toBeNull();
    toggleEquip('dog', AGORA);
    expect(state.pets.active).toBeNull();
  });

  it('skill: uma por pet, só das que a forma tem; clicar na ativa desliga; marca a troca', () => {
    state.pets.owned = [inst({ id: 'owl', species: 'owl' })];
    const owl = state.pets.owned[0]!;
    toggleSkill('owl', 'noturno', AGORA);
    expect(owl.skill).toBe('noturno');
    expect(owl.skillActivatedAt).toBe(AGORA.getTime());
    toggleSkill('owl', 'fiel', AGORA); // coruja não tem Fiel
    expect(owl.skill).toBe('noturno');
    toggleSkill('owl', 'voo', AGORA);
    expect(owl.skill).toBe('voo');
    toggleSkill('owl', 'voo', AGORA);
    expect(owl.skill).toBeNull();
  });

  it('renomear é grátis, mas o nome precisa servir', () => {
    state.pets.owned = [inst()];
    expect(renamePet('dog', ' Rex ')).toBe(true);
    expect(state.pets.owned[0]!.name).toBe('Rex');
    expect(renamePet('dog', '')).toBe(false);
    expect(renamePet('nope', 'x')).toBe(false);
  });

  it('evoluir: precisa de nível; troca a forma no lugar; é definitivo', () => {
    state.pets.owned = [inst()];
    expect(evolvePet('dog', 'selvagem')).toBe('not-ready');
    state.pets.owned[0]!.xp = petLevelStart(DOG_EVOLVE_LEVEL);
    expect(evolvePet('dog', 'nada')).toBe('invalid-path');
    expect(evolvePet('dog', 'selvagem')).toBe('ok');
    expect(petForm(state.pets.owned[0]!).id).toBe('wolf');
    expect(state.pets.owned[0]!.name).toBe('Bolt');
    expect(evolvePet('dog', 'selvagem')).toBe('none');
    expect(evolvePet('x')).toBe('unknown');
  });

  it('XP pendente credita a instância equipada no check de um dia fechado, uma vez só', () => {
    state.pets.owned = [inst({ id: 'cat', species: 'cat', name: 'Mia' })];
    state.pets.active = 'cat';
    state.pets.xpProcessedUntil = ANTEONTEM;
    const b = blocksForDay(ONTEM).find((x) => x.type === 'estudo')!;
    toggleBlockCheck(ONTEM, b, AGORA);
    applyPendingPetXP(AGORA);
    expect(state.pets.owned[0]!.xp).toBe(50);
    expect(state.pets.xpProcessedUntil).toBe(ONTEM);
    applyPendingPetXP(AGORA);
    expect(state.pets.owned[0]!.xp).toBe(50); // idempotente
  });

  it('o check guarda o id da instância e o bônus da skill dela (Fiel: só o 1º estudo)', () => {
    state.pets.owned = [inst({ skill: 'fiel', skillActivatedAt: OITO_DA_MANHA })];
    state.pets.active = 'dog';
    state.pets.activeSince = OITO_DA_MANHA;
    const [b1, b2] = blocksForDay(HOJE).filter((x) => x.type === 'estudo');
    expect(toggleBlockCheck(HOJE, b1!, AGORA)).toMatchObject({ checked: true, xp: 53 });
    expect(state.checks[HOJE]![b1!.time]).toEqual({ pet: 'dog', bonus: 0.05 });
    expect(toggleBlockCheck(HOJE, b2!, AGORA)).toMatchObject({ checked: true, xp: 50 });
    expect(state.checks[HOJE]![b2!.time]).toEqual({ pet: 'dog', bonus: 0 });
  });

  it('equipar o pet depois do bloco começar não dá bônus (anti-exploit)', () => {
    state.pets.owned = [inst({ skill: 'fiel', skillActivatedAt: OITO_DA_MANHA })];
    state.pets.active = 'dog';
    state.pets.activeSince = AGORA.getTime(); // equipou às 17:30, o bloco das 09:00 já tinha começado
    const b1 = blocksForDay(HOJE).find((x) => x.type === 'estudo')!;
    expect(toggleBlockCheck(HOJE, b1, AGORA)).toMatchObject({ xp: 50 });
  });
});
