import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAccount } from '../src/application/account';
import { blocksForDay, computeStatsNow, rebuildWeeks } from '../src/application/plan';
import { cancelSession, saveSettings } from '../src/application/settings';
import { defaultDraft } from '../src/domain/settings';
import { SCHEMA_VERSION, emptyPersistedState, hydrateUserDoc, serializeState } from '../src/domain/persistence';
import { auth, users } from '../src/infrastructure';
import { derived, state } from '../src/store/store';

const AGORA = new Date('2026-09-02T17:30:00');

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  state.config.periodStart = '2026-08-01';
  derived.weeks = [];
  rebuildWeeks(AGORA);
  await auth.signIn();
});

describe('saveSettings', () => {
  it('aplica o rascunho, preserva o periodStart e refaz as semanas', () => {
    const antes = derived.weeks.length;
    const r = saveSettings({ ...defaultDraft(), pomo: '50', periodEnd: '2026-09-20' });
    expect(r).toEqual({ ok: true, plan: 'from-today' }); // 17:30 sem nada marcado: hoje ainda entra na mudança
    expect(state.config.pomo).toBe(50);
    expect(state.config.periodStart).toBe('2026-08-01'); // fixo por sessão
    expect(state.config.periodEnd).toBe('2026-09-20');
    expect(derived.weeks.length).toBeLessThan(antes); // periodEnd encurtou o range
  });

  it('recusa salvar com campo numérico vazio (antes gravava NaN)', () => {
    const pomoAntes = state.config.pomo;
    expect(saveSettings({ ...defaultDraft(), shortBreak: '' })).toEqual({ ok: false, reason: 'incomplete' });
    expect(state.config.pomo).toBe(pomoAntes);
  });
});

describe('saveSettings — ritmo e janelas valem de hoje em diante, nunca pra trás', () => {
  const HOJE = '2026-09-02';
  const ONTEM = '2026-09-01';
  const AMANHA = '2026-09-03';
  const primeiroEstudo = (dia: string) => blocksForDay(dia).find((b) => b.type === 'estudo')!;

  it('hoje sem fato: o plano de hoje muda, ontem fica com o ritmo de antes', () => {
    expect(primeiroEstudo(ONTEM).endTime).toBe('09:25');
    const r = saveSettings({ ...defaultDraft(), pomo: '50' });
    expect(r).toEqual({ ok: true, plan: 'from-today' });
    expect(primeiroEstudo(HOJE).endTime).toBe('09:50');
    expect(primeiroEstudo(ONTEM).endTime).toBe('09:25');
    expect(state.configHistory).toEqual([{ until: ONTEM, studyWindows: [{ start: '09:00', end: '18:00' }], pomo: 25, shortBreak: 5, longBreak: 20 }]);
  });

  it('hoje com um bloco marcado: hoje fica como está (o check continua batendo), e a mudança vale de amanhã', () => {
    state.checks[HOJE] = { '09:00': { pet: null, bonus: 0 } };
    const r = saveSettings({ ...defaultDraft(), pomo: '50' });
    expect(r).toEqual({ ok: true, plan: 'from-tomorrow' });
    expect(primeiroEstudo(HOJE).endTime).toBe('09:25');
    expect(primeiroEstudo(AMANHA).endTime).toBe('09:50');
    expect(state.configHistory.map((s) => s.until)).toEqual([HOJE]);
    // O XP de hoje continua lá: o check das 09:00 ainda acha o bloco dele.
    expect(computeStatsNow(AGORA).todayXP).toBe(50);
  });

  it('o bloco no timer também é fato: a mudança fica pra amanhã', () => {
    derived.timerBlock = primeiroEstudo(HOJE);
    derived.timerDay = HOJE;
    expect(saveSettings({ ...defaultDraft(), pomo: '50' })).toEqual({ ok: true, plan: 'from-tomorrow' });
    derived.timerBlock = null;
    derived.timerDay = null;
  });

  it('mudar só a meta ou o período não guarda nada e não avisa', () => {
    const r = saveSettings({ ...defaultDraft(), dailyStudyMin: '90' });
    expect(r).toEqual({ ok: true, plan: 'unchanged' });
    expect(state.configHistory).toEqual([]);
  });

  it('a janela da rotina também vale só de hoje em diante', () => {
    state.checks[HOJE] = { '09:00': { pet: null, bonus: 0 } };
    saveSettings({ ...defaultDraft(), studyWindows: [{ start: '10:00', end: '12:00' }] });
    expect(primeiroEstudo(HOJE).time).toBe('09:00');
    expect(primeiroEstudo(AMANHA).time).toBe('10:00');
  });

  it('a história vai pro documento e volta', () => {
    state.checks[HOJE] = { '09:00': { pet: null, bonus: 0 } };
    saveSettings({ ...defaultDraft(), pomo: '50' });
    expect(state.configHistory).toHaveLength(1);
    expect(hydrateUserDoc(serializeState(state)).configHistory).toEqual(state.configHistory);
  });
});

describe('cancelSession', () => {
  it('zera tudo e volta pra config padrão, mantendo o usuário', () => {
    state.checks = { '2026-09-01': { '09:00': { pet: 'cat', bonus: 0 } } };
    state.pets.owned = [{ id: 'cat', species: 'cat', name: 'Gato', xp: 0, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: 0 }];
    state.coinsSpent = 150;
    state.windowOverrides = { '2026-09-01': { studyWindows: [] } };
    state.tutorialSeen = { plan: true };
    state.configHistory = [{ until: '2026-09-01', studyWindows: [{ start: '09:00', end: '18:00' }], pomo: 25, shortBreak: 5, longBreak: 20 }];
    cancelSession();
    expect(state.checks).toEqual({});
    expect(state.windowOverrides).toEqual({});
    expect(state.configHistory).toEqual([]); // as versões antigas falam de dias que deixaram de existir
    expect(state.tutorialSeen).toEqual({ plan: true }); // o tour visto fica: quem cancelou já conhece o app
    expect(state.pets).toEqual({ owned: [], active: null, activeSince: 0, xpProcessedUntil: null });
    expect(state.coinsSpent).toBe(0);
    expect(state.config.periodStart).toBeNull(); // só aqui o início é redefinido
    expect(state.user?.uid).toBe('u');
  });
});

describe('deleteAccount (infra em memória)', () => {
  it('apaga o documento e desloga', async () => {
    const uid = auth.currentUser()!.uid;
    await users.save(uid, { ...emptyPersistedState(), config: state.config, schemaVersion: SCHEMA_VERSION });
    const stages: string[] = [];
    const r = await deleteAccount((s) => stages.push(s));
    expect(r).toBe('ok');
    expect(stages).toEqual(['deleting']);
    expect(await users.load(uid)).toBeNull();
    expect(auth.currentUser()).toBeNull();
  });
});
