import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activeSkillOf, applyPendingPetXP, buyPet, coinBalance, toggleEquip, toggleSkill } from '../src/application/pets';
import { blocksForDay, clearBlockCache, rebuildWeeks } from '../src/application/plan';
import { toggleBlockCheck } from '../src/application/checks';
import { emptyPersistedState } from '../src/domain/persistence';
import { PETS, PET_LIST, coinBalance as coinBalanceOf, formatStudyHours, petLevel, petProgress, petXP } from '../src/domain/pets';
import { derived, state } from '../src/store/store';

describe('domínio dos pets', () => {
  it('catálogo: 5 pets, todos a 150 moedas, só a coruja com skills', () => {
    expect(PET_LIST).toHaveLength(5);
    expect(PET_LIST.every((p) => p.price === 150)).toBe(true);
    expect(PETS.owl!.skills?.map((s) => s.id)).toEqual(['noturno', 'voo']);
    expect(PETS.cat!.sprite(2)).toBe('idle/pets/cat/2.png');
  });

  it('XP e nível do pet usam a escala do usuário', () => {
    const pets = { xp: { owl: 300 } };
    expect(petXP(pets, 'owl')).toBe(300);
    expect(petXP(pets, 'cat')).toBe(0);
    expect(petLevel(pets, 'owl')).toBe(2); // 250 ≤ 300 < 750
    expect(petProgress(pets, 'owl')).toEqual({ xp: 300, level: 2, pct: 10, nextThreshold: 750, remaining: 450 });
    expect(petProgress({ xp: { owl: 10000 } }, 'owl')).toMatchObject({ level: 8, pct: 100, nextThreshold: null });
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
  const ONTEM = '2026-09-01';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
    derived.weeks = [];
    clearBlockCache();
    rebuildWeeks(AGORA);
  });

  it('não adota sem moedas; adota com moedas, gasta e já equipa', () => {
    expect(buyPet('cat')).toBe('insufficient');
    // 7 estudos de ontem (dia fechado por ser passado) = 175 moedas + 5 de streak.
    blocksForDay(ONTEM).filter((b) => b.type === 'estudo').slice(0, 7).forEach((b) => toggleBlockCheck(ONTEM, b, AGORA));
    expect(coinBalance(AGORA)).toBe(180);
    expect(buyPet('cat')).toBe('ok');
    expect(state.pets.owned).toEqual(['cat']);
    expect(state.pets.active).toBe('cat');
    expect(state.coinsSpent).toBe(150);
    expect(coinBalance(AGORA)).toBe(30);
    expect(buyPet('cat')).toBe('owned');
    expect(buyPet('dragao')).toBe('unknown');
  });

  it('equipar/desequipar é grátis; só pets que você tem', () => {
    state.pets.owned = ['cat', 'owl'];
    toggleEquip('owl');
    expect(state.pets.active).toBe('owl');
    toggleEquip('owl');
    expect(state.pets.active).toBeNull();
    toggleEquip('dog');
    expect(state.pets.active).toBeNull();
  });

  it('skill: uma por pet, clicar na ativa desliga, e marca activatedAt', () => {
    toggleSkill('owl', 'noturno', AGORA);
    expect(activeSkillOf('owl')).toBe('noturno');
    expect(state.skills.activatedAt).toBe(AGORA.getTime());
    toggleSkill('owl', 'voo', AGORA);
    expect(activeSkillOf('owl')).toBe('voo');
    toggleSkill('owl', 'voo', AGORA);
    expect(activeSkillOf('owl')).toBeNull();
  });

  it('XP pendente credita o pet equipado no check de um dia fechado, uma vez só', () => {
    state.pets.owned = ['cat'];
    state.pets.active = 'cat';
    state.pets.xpProcessedUntil = '2026-08-31';
    const b = blocksForDay(ONTEM).find((x) => x.type === 'estudo')!;
    toggleBlockCheck(ONTEM, b, AGORA);
    applyPendingPetXP(AGORA);
    expect(state.pets.xp).toEqual({ cat: 50 });
    expect(state.pets.xpProcessedUntil).toBe(ONTEM);
    applyPendingPetXP(AGORA);
    expect(state.pets.xp).toEqual({ cat: 50 }); // idempotente
  });
});
