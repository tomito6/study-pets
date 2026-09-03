import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toggleBlockCheck } from '../src/application/checks';
import {
  closeDay,
  extendDay,
  initialDayEnd,
  openFinishDay,
  promptFinish,
  resetEndOfDayPrompt,
  scheduleEndOfDayPrompt,
} from '../src/application/dayEnd';
import { finishOnboarding } from '../src/application/onboarding';
import { blocksForDay, clearBlockCache, rebuildWeeks } from '../src/application/plan';
import { initAfterLoad, loadUserData } from '../src/application/session';
import { daySummary } from '../src/domain/daySummary';
import { extendDayTo, lastStudyEnd, shouldPromptEndOfDay, suggestedExtendTime } from '../src/domain/endOfDay';
import { DEFAULT_CFG } from '../src/domain/config';
import { emptyPersistedState } from '../src/domain/persistence';
import { users } from '../src/infrastructure';
import { derived, state } from '../src/store/store';

const HOJE = '2026-09-02';

function resetAt(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.weeks = [];
  derived.dayEnd = initialDayEnd();
  derived.onboardingOpen = false;
  clearBlockCache();
  resetEndOfDayPrompt();
  rebuildWeeks(new Date(iso));
}

describe('domínio do fim do dia', () => {
  it('resumo: ganhos do usuário e dos pets, com level up', () => {
    const s = daySummary(
      { totalXP: 200, coins: 100, userLevelIdx: 0, petXP: { cat: 700 } },
      { totalXP: 300, coins: 150, userLevelIdx: 1, petXP: { cat: 800, owl: 0 } },
    );
    expect(s).toMatchObject({ userXP: 100, userCoins: 50, userLevelUp: true, newLevel: 2, newLevelName: 'Iniciante', empty: false });
    expect(s.pets).toEqual([{ id: 'cat', gain: 100, oldLevel: 7, newLevel: 8, levelUp: true }]); // curva própria do pet
  });

  it('resumo vazio quando nada mudou', () => {
    const snap = { totalXP: 0, coins: 0, userLevelIdx: 0, petXP: {} };
    expect(daySummary(snap, snap).empty).toBe(true);
  });

  it('último estudo do dia, e quando vale perguntar', () => {
    const blocks = blocksForDay(HOJE);
    expect(lastStudyEnd(blocks)).toBe('17:40');
    expect(lastStudyEnd([])).toBeNull();
    const base = { dayClosed: false, hasCheckToday: true, lastEnd: '17:40', now: new Date('2026-09-02T17:45:00') };
    expect(shouldPromptEndOfDay(base)).toBe(true);
    expect(shouldPromptEndOfDay({ ...base, now: new Date('2026-09-02T17:00:00') })).toBe(false);
    expect(shouldPromptEndOfDay({ ...base, hasCheckToday: false })).toBe(false);
    expect(shouldPromptEndOfDay({ ...base, dayClosed: true })).toBe(false);
  });

  it('prolongar estica a última janela; sugestão é agora + 1h', () => {
    const cfg = extendDayTo({ ...DEFAULT_CFG, studyWindows: [{ start: '15:00', end: '18:00' }, { start: '09:00', end: '12:00' }] }, '20:00');
    expect(cfg.end).toBe('20:00');
    expect(cfg.studyWindows).toEqual([{ start: '15:00', end: '20:00' }, { start: '09:00', end: '12:00' }]);
    expect(suggestedExtendTime(new Date('2026-09-02T17:45:00'))).toBe('18:45');
  });
});

describe('encerrar o dia', () => {
  beforeEach(() => resetAt('2026-09-02T17:30:00'));

  it('trava os checks, credita o pet na hora e monta o resumo', () => {
    state.pets.owned = [{ id: 'cat', species: 'cat', name: 'Mia', xp: 0, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: 0 }];
    state.pets.active = 'cat';
    state.pets.xpProcessedUntil = '2026-09-01';
    const b = blocksForDay(HOJE).find((x) => x.type === 'estudo')!;
    toggleBlockCheck(HOJE, b);
    openFinishDay();
    expect(derived.dayEnd.confirmOpen).toBe(true);

    const s = closeDay();
    expect(state.closedDays[HOJE]).toBe(true);
    expect(s).toMatchObject({ userXP: 50, userCoins: 25, empty: false });
    expect(s.pets).toEqual([{ id: 'cat', gain: 50, oldLevel: 1, newLevel: 2, levelUp: true }]); // 50 XP = Lv. 2
    expect(state.pets.owned[0]!.xp).toBe(50);
    expect(derived.dayEnd).toMatchObject({ confirmOpen: false, promptOpen: false });
    expect(derived.dayEnd.summary).toBe(s);
    expect(toggleBlockCheck(HOJE, blocksForDay(HOJE)[2]!)).toBeNull(); // read-only
  });
});

describe('prompt automático de fim de dia', () => {
  it('dispara no fim do último estudo, uma vez, se houve check', () => {
    resetAt('2026-09-02T17:00:00');
    toggleBlockCheck(HOJE, blocksForDay(HOJE)[0]!);
    scheduleEndOfDayPrompt();
    expect(derived.dayEnd.promptOpen).toBe(false);
    vi.advanceTimersByTime(40 * 60 * 1000 + 1000); // 17:40
    expect(derived.dayEnd.promptOpen).toBe(true);
    expect(derived.dayEnd.promptLastEnd).toBe('17:40');
    promptFinish();
    expect(derived.dayEnd).toMatchObject({ promptOpen: false, confirmOpen: true });
  });

  it('não dispara sem check, e prolongar reagenda pro novo horário', () => {
    resetAt('2026-09-02T17:50:00');
    scheduleEndOfDayPrompt();
    expect(derived.dayEnd.promptOpen).toBe(false); // sem check hoje

    toggleBlockCheck(HOJE, blocksForDay(HOJE)[0]!);
    scheduleEndOfDayPrompt(); // já passou das 17:40 → checa na hora
    expect(derived.dayEnd.promptOpen).toBe(true);

    extendDay('19:00');
    expect(state.config.end).toBe('19:00');
    expect(derived.dayEnd.promptOpen).toBe(false);
    expect(lastStudyEnd(blocksForDay(HOJE))! > '17:40').toBe(true);
  });
});

describe('onboarding e boot', () => {
  beforeEach(() => resetAt('2026-09-02T09:00:00'));

  it('onboarding define o período e fecha; recusa fim antes do início', () => {
    derived.onboardingOpen = true;
    expect(finishOnboarding({ periodStart: '2026-09-02', periodEnd: '2026-09-01', skipWeekends: false })).toEqual({ ok: false, reason: 'end-before-start' });
    expect(derived.onboardingOpen).toBe(true);
    expect(finishOnboarding({ periodStart: '2026-09-02', periodEnd: null, skipWeekends: true })).toEqual({ ok: true });
    expect(state.config).toMatchObject({ periodStart: '2026-09-02', periodEnd: null, skipWeekends: true });
    expect(derived.onboardingOpen).toBe(false);
  });

  it('carrega conta nova como nova, e uma existente com os dados dela', async () => {
    expect(await loadUserData('novo')).toBe(true);
    await users.save('antigo', { ...emptyPersistedState(), coinsSpent: 150, schemaVersion: 1 } as never);
    expect(await loadUserData('antigo')).toBe(false);
    expect(state.coinsSpent).toBe(150);
  });

  it('o boot aponta a semana e o dia de hoje', () => {
    initAfterLoad(new Date('2026-09-02T09:00:00'));
    expect(state.uiWeek).toBe(1);
    expect(state.uiDay).toBe(2); // quarta
  });
});
