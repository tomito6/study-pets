import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDay } from '../src/application/dayEnd';
import { adoptStarter, applyPendingPetXP, buyPet, coinBalance, evolvePet, needsStarter, renamePet, toggleEquip, toggleSkill } from '../src/application/pets';
import { blocksForDay, clearBlockCache, rebuildWeeks } from '../src/application/plan';
import { toggleBlockCheck } from '../src/application/checks';
import { emptyPersistedState } from '../src/domain/persistence';
import { existsSync } from 'node:fs';
import {
  EVOLVE_LEVELS,
  FORMS,
  PETS,
  PET_LIST,
  canEvolveNow,
  coinBalance as coinBalanceOf,
  evolutionOf,
  evolve,
  formatStudyHours,
  legacyPetInstance,
  newPetInstance,
  normalizePetInstance,
  normalizePetName,
  petForm,
  petLevel,
  petLevelFromXP,
  petLevelStart,
  petProgress,
  petXpToNext,
  petsReadyToEvolve,
  speciesForm,
  suggestPetName,
} from '../src/domain/pets';
import { SKILLS, SKILL_TIERS } from '../src/domain/progression';
import type { FormId, PetInstance } from '../src/domain/types';
import { derived, state } from '../src/store/store';

const inst = (over: Partial<PetInstance> = {}): PetInstance => ({
  id: 'dog', species: 'dog', name: 'Bolt', xp: 0, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: 0, ...over,
});

describe('catálogo', () => {
  it('5 espécies a 150 moedas, cada uma com pelo menos uma skill; toda forma e skill referenciada existe', () => {
    expect(PET_LIST).toHaveLength(5);
    expect(PET_LIST.every((p) => p.price === 150)).toBe(true);
    expect(PET_LIST.every((p) => speciesForm(p).skills.length > 0)).toBe(true);
    for (const s of PET_LIST) {
      expect(FORMS[s.form], s.id).toBeDefined();
      for (const path of s.paths) for (const st of path.stages) expect(FORMS[st.form], st.form).toBeDefined();
    }
    for (const f of Object.values(FORMS)) for (const id of f.skills) expect(SKILLS[id], id).toBeDefined();
    expect(Object.keys(FORMS)).toHaveLength(25);
    expect(speciesForm(PETS.cat!).sprite(2)).toBe('idle/pets/cat/2.png');
    expect(FORMS.dove!.skills).toEqual(['aula']);
    expect(FORMS.owl).toBeUndefined(); // a coruja virou pomba
  });

  it('toda espécie tem dois caminhos de dois estágios (Lv. 5 e Lv. 15); cada forma aparece uma vez; o 2º estágio só soma skill', () => {
    expect(EVOLVE_LEVELS).toEqual([5, 15]);
    const seen = new Set<string>();
    for (const s of PET_LIST) {
      expect(s.paths, s.id).toHaveLength(2);
      for (const path of s.paths) {
        expect(path.stages.map((st) => st.level), `${s.id}/${path.id}`).toEqual([5, 15]);
        const [first, second] = path.stages.map((st) => FORMS[st.form]!);
        for (const st of path.stages) {
          expect(seen.has(st.form), st.form).toBe(false);
          seen.add(st.form);
        }
        // A escada é sempre 1 → 2 → 3: a espécie nasce com uma, a escolha do Lv. 5 tem duas,
        // o avanço do Lv. 15 tem três. A escolha pode TROCAR a da base (o lobo larga a Fiel);
        // o avanço nunca tira, só acrescenta.
        expect(speciesForm(s).skills.length, s.id).toBe(1);
        expect(first!.skills.length, first!.id).toBe(2);
        expect(second!.skills.length, second!.id).toBe(3);
        for (const skill of first!.skills) expect(second!.skills, `${second!.id} perdeu ${skill}`).toContain(skill);
      }
    }
    expect(seen.size).toBe(20);
  });

  it('nenhuma forma repete o conjunto de skills de outra — escolher caminho é escolher um jeito de estudar', () => {
    const vistos = new Map<string, FormId>();
    for (const f of Object.values(FORMS)) {
      const chave = [...f.skills].sort().join('+');
      expect(vistos.has(chave), `${f.id} tem as mesmas skills de ${vistos.get(chave)}`).toBe(false);
      vistos.set(chave, f.id);
    }
  });

  it('toda skill do catálogo mora em alguma forma — nada fica escrito e inalcançável', () => {
    const usadas = new Set(Object.values(FORMS).flatMap((f) => f.skills));
    for (const id of Object.keys(SKILLS)) expect(usadas.has(id), `${id} não está em forma nenhuma`).toBe(true);
  });

  it('as skills de uma forma nunca são a mesma coisa duas vezes, nem se anulam', () => {
    for (const f of Object.values(FORMS)) {
      expect(new Set(f.skills).size, f.id).toBe(f.skills.length);
      // Duas faixas de horário na mesma forma só valem se uma pagar mais que a outra
      // onde a outra não chega — senão uma delas nunca seria escolhida.
      const faixas = f.skills.map((id) => SKILLS[id]!).filter((sk) => sk.rule.kind === 'hour-range');
      for (const a of faixas) {
        for (const b of faixas) {
          if (a === b || a.rule.kind !== 'hour-range' || b.rule.kind !== 'hour-range') continue;
          const contido = a.rule.from >= b.rule.from && a.rule.to <= b.rule.to;
          if (contido) {
            // A mais estreita tem que pagar mais: é o que impede a "skill morta".
            expect(SKILL_TIERS[a.tier]!.weight, `${a.id} dentro de ${b.id} em ${f.id}`)
              .toBeGreaterThan(SKILL_TIERS[b.tier]!.weight);
          }
        }
      }
    }
  });

  it('o cachorro: pastor alemão → cão lendário ou lobo → lobo lunar; o gato: egípcio → esfinge ou lince → tigre', () => {
    expect(PETS.dog!.paths.map((p) => p.id)).toEqual(['companheiro', 'selvagem']);
    expect(PETS.dog!.paths.map((p) => p.stages.map((s) => s.form))).toEqual([['dog-shepherd', 'dog-legend'], ['wolf', 'wolf-lunar']]);
    expect(PETS.cat!.paths.map((p) => p.stages.map((s) => s.form))).toEqual([['cat-egyptian', 'sphinx'], ['lynx', 'tiger']]);
  });

  it('toda forma tem os 4 frames desenhados em public/idle/pets/ (scripts/pixel-sprites.mjs)', () => {
    for (const f of Object.values(FORMS)) for (let i = 0; i < f.frames; i++) expect(existsSync(`public/${f.sprite(i)}`), f.sprite(i)).toBe(true);
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

  it('evolução: trancada antes do nível, escolha no Lv. 5 (mostrando o que vem depois), avanço no Lv. 15, nada depois', () => {
    expect(evolutionOf(inst({ xp: 0 }))).toEqual({ kind: 'locked', level: 5 });
    const e = evolutionOf(inst({ xp: petLevelStart(5) }));
    expect(e?.kind).toBe('choose');
    const options = e && e.kind === 'choose' ? e.options : [];
    expect(options.map((o) => o.form.id)).toEqual(['dog-shepherd', 'wolf']);
    expect(options.map((o) => o.next)).toEqual([{ form: FORMS['dog-legend'], level: 15 }, { form: FORMS['wolf-lunar'], level: 15 }]);
    expect(evolutionOf(inst({ xp: petLevelStart(5), path: 'selvagem', stage: 1 }))).toEqual({ kind: 'locked', level: 15 });
    expect(evolutionOf(inst({ xp: petLevelStart(15), path: 'selvagem', stage: 1 }))).toEqual({ kind: 'advance', level: 15, form: FORMS['wolf-lunar'] });
    expect(evolutionOf(inst({ xp: 9999, path: 'selvagem', stage: 2 }))).toBeNull(); // fim do caminho
    expect(evolutionOf(inst({ species: 'xyz', xp: 9999 }))).toBeNull(); // espécie desconhecida não evolui
  });

  it('evolve: recusa sem nível ou com caminho inválido; aplica sem mutar; skill que a forma nova não tem cai', () => {
    expect(evolve(inst())).toEqual({ ok: false, reason: 'not-ready' });
    const pronto = inst({ xp: petLevelStart(5), skill: 'fiel' });
    expect(evolve(pronto, 'nada')).toEqual({ ok: false, reason: 'invalid-path' });

    const lobo = evolve(pronto, 'selvagem');
    expect(lobo.ok).toBe(true);
    if (lobo.ok) {
      expect(lobo.pet).toMatchObject({ name: 'Bolt', xp: petLevelStart(5), path: 'selvagem', stage: 1, skill: null });
      expect(petForm(lobo.pet).id).toBe('wolf');
    }
    expect(pronto.stage).toBe(0);

    const pastor = evolve(pronto, 'companheiro');
    if (pastor.ok) expect(pastor.pet.skill).toBe('fiel'); // o pastor alemão ainda tem a Fiel

    // Segundo estágio: sem escolha (o caminho já está feito), a skill ativa continua
    const lunar = evolve(inst({ xp: petLevelStart(15), path: 'selvagem', stage: 1, skill: 'noturno' }));
    expect(lunar.ok).toBe(true);
    if (lunar.ok) {
      expect(lunar.pet).toMatchObject({ path: 'selvagem', stage: 2, skill: 'noturno' });
      expect(petForm(lunar.pet).id).toBe('wolf-lunar');
    }
    expect(evolve(inst({ xp: petLevelStart(5), path: 'selvagem', stage: 1 }))).toEqual({ ok: false, reason: 'not-ready' });
    expect(evolve(inst({ species: 'xyz', xp: 999 }))).toEqual({ ok: false, reason: 'none' });
  });

  it('canEvolveNow / petsReadyToEvolve: só quem chegou no nível e tem escolha ou avanço esperando', () => {
    const pronto = inst({ xp: petLevelStart(5) });
    expect(canEvolveNow(inst())).toBe(false);
    expect(canEvolveNow(pronto)).toBe(true);
    expect(canEvolveNow(inst({ id: 'cat', species: 'cat', xp: 9999, path: 'selvagem', stage: 2 }))).toBe(false); // fim do caminho
    const avanco = inst({ id: 'dog-2', xp: petLevelStart(15), path: 'selvagem', stage: 1 });
    const trancado = inst({ id: 'dog-3', xp: petLevelStart(5), path: 'selvagem', stage: 1 });
    expect(petsReadyToEvolve([inst(), pronto, avanco, trancado]).map((p) => p.id)).toEqual(['dog', 'dog-2']);
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

  it('instância legada: id = espécie, nome = nome da forma; a coruja vira pomba e perde a skill que a pomba não tem', () => {
    expect(legacyPetInstance('cat', 300, null, 0)).toEqual({
      id: 'cat', species: 'cat', name: 'Gato', xp: 300, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: 0,
    });
    expect(legacyPetInstance('owl', 300, 'noturno', 5)).toEqual({
      id: 'owl', species: 'dove', name: 'Pomba', xp: 300, path: null, stage: 0, skill: null, skillActivatedAt: 5, adoptedAt: 0,
    });
    expect(legacyPetInstance('dragao', 0, null, 0).name).toBe('dragao');
  });

  it('normalizePetInstance: traduz espécie renomeada e desliga skill fora da forma; sem mudança devolve a mesma referência', () => {
    const owl = inst({ id: 'owl', species: 'owl', name: 'Sofia', skill: 'noturno' });
    expect(normalizePetInstance(owl)).toMatchObject({ id: 'owl', species: 'dove', name: 'Sofia', skill: null });
    const dove = inst({ id: 'owl', species: 'dove', skill: 'aula' });
    expect(normalizePetInstance(dove)).toBe(dove);
    // A pomba perdeu a Madrugador quando o catálogo foi rebalanceado: a leitura desliga sozinha.
    expect(normalizePetInstance(inst({ id: 'owl', species: 'dove', skill: 'madrugador' })).skill).toBeNull();
    expect(normalizePetInstance(inst({ skill: 'noturno' })).skill).toBeNull(); // cachorro não tem Noturno
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
    state.pets.owned = [inst({ id: 'cat', species: 'cat' }), inst({ id: 'dove', species: 'dove' })];
    toggleEquip('dove', AGORA);
    expect(state.pets.active).toBe('dove');
    expect(state.pets.activeSince).toBe(AGORA.getTime());
    toggleEquip('dove', AGORA);
    expect(state.pets.active).toBeNull();
    toggleEquip('dog', AGORA);
    expect(state.pets.active).toBeNull();
  });

  it('skill: uma por pet, só das que a forma tem; clicar na ativa desliga; marca a troca', () => {
    // Falcão (pomba no caminho rapina, Lv. 5): madrugador + vespertino.
    state.pets.owned = [inst({ id: 'dove', species: 'dove', path: 'rapina', stage: 1 })];
    const falcao = state.pets.owned[0]!;
    toggleSkill('dove', 'madrugador', AGORA);
    expect(falcao.skill).toBe('madrugador');
    expect(falcao.skillActivatedAt).toBe(AGORA.getTime());
    toggleSkill('dove', 'fiel', AGORA); // falcão não tem Fiel
    expect(falcao.skill).toBe('madrugador');
    toggleSkill('dove', 'vespertino', AGORA);
    expect(falcao.skill).toBe('vespertino');
    toggleSkill('dove', 'vespertino', AGORA);
    expect(falcao.skill).toBeNull();
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
    state.pets.owned[0]!.xp = petLevelStart(5);
    expect(evolvePet('dog', 'nada')).toBe('invalid-path');
    expect(evolvePet('dog', 'selvagem')).toBe('ok');
    expect(petForm(state.pets.owned[0]!).id).toBe('wolf');
    expect(state.pets.owned[0]!.name).toBe('Bolt');
    expect(evolvePet('dog')).toBe('not-ready'); // o segundo estágio é no Lv. 15
    state.pets.owned[0]!.xp = petLevelStart(15);
    expect(evolvePet('dog')).toBe('ok');
    expect(petForm(state.pets.owned[0]!).id).toBe('wolf-lunar');
    expect(evolvePet('dog')).toBe('none');
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
    // Fiel é tier `baixa` (acontece 1× por dia), então paga o triplo: 15% no Lv. 1.
    expect(toggleBlockCheck(HOJE, b1!, AGORA)).toMatchObject({ checked: true, xp: 57 });
    expect(state.checks[HOJE]![b1!.time]).toEqual({ pet: 'dog', bonus: 0.15 });
    expect(toggleBlockCheck(HOJE, b2!, AGORA)).toMatchObject({ checked: true, xp: 50 });
    expect(state.checks[HOJE]![b2!.time]).toEqual({ pet: 'dog', bonus: 0 });
  });

  it('o bônus da skill cresce com o nível do pet — o nível já creditado, não o do XP pendente de hoje', () => {
    // Lv. 4, faltando 10 XP pro Lv. 5. Fiel: o primeiro estudo do dia.
    state.pets.owned = [inst({ skill: 'fiel', skillActivatedAt: OITO_DA_MANHA, xp: petLevelStart(5) - 10 })];
    state.pets.active = 'dog';
    state.pets.activeSince = OITO_DA_MANHA;
    state.pets.xpProcessedUntil = ONTEM;
    const [b1] = blocksForDay(HOJE).filter((x) => x.type === 'estudo');
    // Lv. 4 → 8% do nível × 3 (tier `baixa` da Fiel) = 24%: 50 XP viram 62
    expect(toggleBlockCheck(HOJE, b1!, AGORA)).toMatchObject({ checked: true, xp: 62 });
    expect(state.checks[HOJE]![b1!.time]).toEqual({ pet: 'dog', bonus: 0.24 });
    // Esse check cruzaria o Lv. 5, mas o XP só entra quando o dia fecha: desmarcar e marcar de novo continua 8%
    toggleBlockCheck(HOJE, b1!, AGORA);
    expect(petLevel(state.pets.owned[0]!)).toBe(4);
    expect(toggleBlockCheck(HOJE, b1!, AGORA)).toMatchObject({ xp: 62 });
    // Dia fechado: o pet vira Lv. 5 (o próximo check já valeria 9%), e o bônus salvo no check não muda
    closeDay(AGORA);
    expect(petLevel(state.pets.owned[0]!)).toBe(5);
    expect(state.checks[HOJE]![b1!.time]).toEqual({ pet: 'dog', bonus: 0.24 });
  });

  it('Preguiça: o estudo logo depois da pausa longa ganha o bônus, o seguinte não', () => {
    state.pets.owned = [inst({ id: 'cat', species: 'cat', skill: 'preguica', skillActivatedAt: OITO_DA_MANHA })];
    state.pets.active = 'cat';
    state.pets.activeSince = OITO_DA_MANHA;
    const blocks = blocksForDay(HOJE);
    const i = blocks.findIndex((b, k) => b.type === 'estudo' && k > 0 && blocks[k - 1]!.name.includes('longa'));
    expect(i).toBeGreaterThan(0);
    // Preguiça é tier `media`: 10% no Lv. 1.
    expect(toggleBlockCheck(HOJE, blocks[i]!, AGORA)).toMatchObject({ xp: 55 });
    const next = blocks.find((b, k) => k > i && b.type === 'estudo')!;
    expect(toggleBlockCheck(HOJE, next, AGORA)).toMatchObject({ xp: 50 });
  });

  /** Equipa um pet com a skill dada, ativa desde as 8h — antes de qualquer bloco começar. */
  const comSkill = (skill: string, over: Partial<PetInstance> = {}) => {
    state.pets.owned = [inst({ skill, skillActivatedAt: OITO_DA_MANHA, ...over })];
    state.pets.active = state.pets.owned[0]!.id;
    state.pets.activeSince = OITO_DA_MANHA;
  };

  it('Ponto final: vale no último estudo do plano, mesmo marcando fora de ordem', () => {
    comSkill('ponto-final', { id: 'snake', species: 'snake', path: 'ancestral', stage: 2 }); // basilisco
    const estudos = blocksForDay(HOJE).filter((b) => b.type === 'estudo' || b.type === 'event');
    const ultimo = estudos[estudos.length - 1]!;
    // Marca o último primeiro: a skill olha a posição no plano, não a ordem dos checks.
    expect(state.checks[HOJE]?.[ultimo.time]).toBeUndefined();
    toggleBlockCheck(HOJE, ultimo, AGORA);
    expect(state.checks[HOJE]![ultimo.time]).toMatchObject({ bonus: 0.15 });
    toggleBlockCheck(HOJE, estudos[0]!, AGORA);
    expect(state.checks[HOJE]![estudos[0]!.time]).toMatchObject({ bonus: 0 });
  });

  it('Afinco vale em todo estudo do grupo; Empenho só no check que fecha ele', () => {
    const estudos = blocksForDay(HOJE).filter((b) => b.type === 'estudo').slice(0, 2);
    const [a, b] = estudos as [typeof estudos[0], typeof estudos[0]];
    state.groups[HOJE] = [{ id: 'g1', start: a.time, end: b.endTime, name: 'Análise II', goal: '' }];

    comSkill('afinco', { id: 'cat', species: 'cat', path: 'sabio', stage: 1 }); // gato egípcio
    toggleBlockCheck(HOJE, a, AGORA);
    toggleBlockCheck(HOJE, b, AGORA);
    expect(state.checks[HOJE]![a.time]).toMatchObject({ bonus: 0.05 });
    expect(state.checks[HOJE]![b.time]).toMatchObject({ bonus: 0.05 });

    delete state.checks[HOJE];
    comSkill('empenho', { id: 'cat', species: 'cat', path: 'sabio', stage: 2 }); // esfinge
    toggleBlockCheck(HOJE, a, AGORA);
    expect(state.checks[HOJE]![a.time]).toMatchObject({ bonus: 0 }); // ainda falta um
    toggleBlockCheck(HOJE, b, AGORA);
    expect(state.checks[HOJE]![b.time]).toMatchObject({ bonus: 0.15 }); // este fechou
  });

  it('Recomeço vale no dia da volta — e some assim que ontem teve estudo', () => {
    comSkill('recomeco', { id: 'dove', species: 'dove', path: 'solar', stage: 1 }); // pássaro de fogo
    const [b1] = blocksForDay(HOJE).filter((b) => b.type === 'estudo');
    expect(toggleBlockCheck(HOJE, b1!, AGORA)).toMatchObject({ checked: true });
    expect(state.checks[HOJE]![b1!.time]).toMatchObject({ bonus: 0.05 }); // ontem em branco

    delete state.checks[HOJE];
    estudarSete(ONTEM);
    expect(toggleBlockCheck(HOJE, b1!, AGORA)).toMatchObject({ checked: true });
    expect(state.checks[HOJE]![b1!.time]).toMatchObject({ bonus: 0 });
  });

  it('Descansado não confunde folga com sumiço: ontem de folga vale pra ela, não pra Recomeço', () => {
    state.windowOverrides[ONTEM] = { studyWindows: [] }; // ontem foi dia livre
    const [b1] = blocksForDay(HOJE).filter((b) => b.type === 'estudo');

    comSkill('descansado', { id: 'cow', species: 'cow', path: 'campea', stage: 1 }); // vaca premiada
    toggleBlockCheck(HOJE, b1!, AGORA);
    expect(state.checks[HOJE]![b1!.time]).toMatchObject({ bonus: 0.05 });

    // Recomeço olha o último dia que CONTAVA — anteontem, que teve estudo. Folga não é sumiço.
    delete state.checks[HOJE];
    estudarSete(ANTEONTEM);
    comSkill('recomeco', { id: 'dove', species: 'dove', path: 'solar', stage: 1 });
    toggleBlockCheck(HOJE, b1!, AGORA);
    expect(state.checks[HOJE]![b1!.time]).toMatchObject({ bonus: 0 });
  });

  it('pet inicial: de graça, só pra quem não tem pet, já equipado', () => {
    expect(needsStarter()).toBe(true);
    expect(adoptStarter('dragao', 'X', AGORA)).toBe('unknown');
    expect(adoptStarter('snake', '  ', AGORA)).toBe('invalid-name');
    expect(adoptStarter('snake', ' Sibila ', AGORA)).toBe('ok');
    expect(state.pets.owned).toMatchObject([{ id: 'snake', species: 'snake', name: 'Sibila', xp: 0, adoptedAt: AGORA.getTime() }]);
    expect(state.pets.active).toBe('snake');
    expect(state.coinsSpent).toBe(0);
    expect(needsStarter()).toBe(false);
    expect(adoptStarter('cat', 'Mia', AGORA)).toBe('already-has-pet');
    expect(state.pets.owned).toHaveLength(1);
  });

  it('equipar o pet depois do bloco começar não dá bônus (anti-exploit)', () => {
    state.pets.owned = [inst({ skill: 'fiel', skillActivatedAt: OITO_DA_MANHA })];
    state.pets.active = 'dog';
    state.pets.activeSince = AGORA.getTime(); // equipou às 17:30, o bloco das 09:00 já tinha começado
    const b1 = blocksForDay(HOJE).find((x) => x.type === 'estudo')!;
    expect(toggleBlockCheck(HOJE, b1, AGORA)).toMatchObject({ xp: 50 });
  });
});

describe('anti-exploit: desmarcar e remarcar não pode repagar bônus', () => {
  const AGORA = new Date('2026-09-02T17:30:00');
  const HOJE = '2026-09-02';
  const OITO_DA_MANHA = new Date('2026-09-02T08:00:00').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
    derived.weeks = [];
    clearBlockCache();
    rebuildWeeks(AGORA);
  });

  const equipar = (skill: string, over: Partial<PetInstance> = {}) => {
    state.pets.owned = [{ id: 'dog', species: 'dog', name: 'Bolt', xp: 0, path: null, stage: 0, skill, skillActivatedAt: OITO_DA_MANHA, adoptedAt: 0, ...over }];
    state.pets.active = state.pets.owned[0]!.id;
    state.pets.activeSince = OITO_DA_MANHA;
  };
  /** Quantos checks do dia carregam bônus, e a soma deles. */
  const bonificados = () => {
    const day = state.checks[HOJE] ?? {};
    const vals = Object.values(day).map((c) => (c === true ? 0 : c.bonus || 0)).filter((b) => b > 0);
    return { quantos: vals.length, soma: Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100 };
  };

  it('Maratona: remarcar os primeiros blocos não faz eles virarem o 5º estudo', () => {
    equipar('maratona');
    const estudos = blocksForDay(HOJE).filter((b) => b.type === 'estudo').slice(0, 8);
    for (const b of estudos) toggleBlockCheck(HOJE, b, AGORA);
    const honesto = bonificados();
    expect(honesto.quantos).toBe(4); // do 5º ao 8º

    for (const b of estudos.slice(0, 4)) {
      toggleBlockCheck(HOJE, b, AGORA); // desmarca
      toggleBlockCheck(HOJE, b, AGORA); // remarca
    }
    expect(bonificados()).toEqual(honesto); // nada a mais
  });

  it('Constância: só um bloco por dia bate a meta, por mais que se remarque', () => {
    equipar('constancia');
    const estudos = blocksForDay(HOJE).filter((b) => b.type === 'estudo').slice(0, 6);
    for (const b of estudos) toggleBlockCheck(HOJE, b, AGORA);
    expect(bonificados().quantos).toBe(1);

    for (const b of estudos) {
      toggleBlockCheck(HOJE, b, AGORA);
      toggleBlockCheck(HOJE, b, AGORA);
    }
    expect(bonificados().quantos).toBe(1);
  });

  it('Empenho: remarcar membro do grupo não faz todo mundo "fechar" ele', () => {
    const estudos = blocksForDay(HOJE).filter((b) => b.type === 'estudo').slice(0, 3);
    state.groups[HOJE] = [{ id: 'g1', start: estudos[0]!.time, end: estudos[2]!.endTime, name: 'Análise II', goal: '' }];
    equipar('empenho', { id: 'cat', species: 'cat', path: 'sabio', stage: 2 }); // esfinge
    for (const b of estudos) toggleBlockCheck(HOJE, b, AGORA);
    expect(bonificados().quantos).toBe(1);

    for (const b of estudos.slice(0, 2)) {
      toggleBlockCheck(HOJE, b, AGORA);
      toggleBlockCheck(HOJE, b, AGORA);
    }
    expect(bonificados().quantos).toBe(1);
  });

  it('Recomeço: uma pausa marcada sozinha ontem não conta como dia cumprido', () => {
    const ONTEM = '2026-09-01';
    const pausa = blocksForDay(ONTEM).find((b) => b.type === 'pausa')!;
    toggleBlockCheck(ONTEM, pausa, AGORA); // só a pausa, nenhum estudo
    equipar('recomeco', { id: 'dove', species: 'dove', path: 'solar', stage: 1 });
    const [b1] = blocksForDay(HOJE).filter((b) => b.type === 'estudo');
    toggleBlockCheck(HOJE, b1!, AGORA);
    expect(state.checks[HOJE]![b1!.time]).toMatchObject({ bonus: 0.05 });

    // Mas um ESTUDO ontem fecha o dia: hoje não é volta de nada.
    delete state.checks[HOJE];
    const estudoOntem = blocksForDay(ONTEM).find((b) => b.type === 'estudo')!;
    toggleBlockCheck(ONTEM, estudoOntem, AGORA);
    toggleBlockCheck(HOJE, b1!, AGORA);
    expect(state.checks[HOJE]![b1!.time]).toMatchObject({ bonus: 0 });
  });

  it('Fiel continua se limitando sozinha: remarcar não devolve o bônus a mais ninguém', () => {
    equipar('fiel');
    const estudos = blocksForDay(HOJE).filter((b) => b.type === 'estudo').slice(0, 5);
    for (const b of estudos) toggleBlockCheck(HOJE, b, AGORA);
    expect(bonificados().quantos).toBe(1);
    for (const b of estudos.slice(1)) {
      toggleBlockCheck(HOJE, b, AGORA);
      toggleBlockCheck(HOJE, b, AGORA);
    }
    expect(bonificados().quantos).toBe(1);
  });
});
