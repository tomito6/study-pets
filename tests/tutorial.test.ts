import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rebuildWeeks } from '../src/application/plan';
import { cancelSession } from '../src/application/settings';
import { currentTourArea, finishTour, restartTour } from '../src/application/tutorial';
import { emptyPersistedState } from '../src/domain/persistence';
import {
  TOUR_AREAS,
  TOUR_MARGIN,
  TOUR_STEPS,
  activeTourArea,
  areaForTab,
  markTourSeen,
  nextTourStep,
  normalizeTutorialSeen,
  placeBalloon,
  tourSteps,
} from '../src/domain/tutorial';
import type { TutorialSeen } from '../src/domain/tutorial';
import { strings } from '../src/shared/strings';
import { derived, getVersion, state } from '../src/store/store';

const ctx = { onboardingOpen: false, loaded: true };

describe('os passos do tour', () => {
  it('cinco balões: três no Plano, um no Perfil, um na Análise, nessa ordem', () => {
    expect(TOUR_STEPS.map((s) => s.area)).toEqual(['plan', 'plan', 'plan', 'profile', 'analytics']);
    expect(tourSteps('plan').map((s) => s.id)).toEqual(['plan-blocks', 'plan-events', 'plan-finish']);
    expect(tourSteps('profile')).toHaveLength(1);
    expect(tourSteps('analytics')).toHaveLength(1);
  });

  it('ids únicos, cada um com título e texto em strings.ts, e âncora em todos', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(strings.tutorial.steps).sort()).toEqual([...ids].sort());
    for (const s of TOUR_STEPS) {
      expect(s.anchor.trim()).not.toBe('');
      if (s.highlight) expect(s.highlight.trim()).not.toBe('');
      const text = strings.tutorial.steps[s.id];
      expect(text.title.length).toBeGreaterThan(0);
      expect(text.text.length).toBeLessThanOrEqual(100); // duas linhas no balão de 280px
    }
  });

  it('aba do store → área; aba desconhecida não tem tour', () => {
    expect(areaForTab('plano')).toBe('plan');
    expect(areaForTab('perfil')).toBe('profile');
    expect(areaForTab('analise')).toBe('analytics');
    expect(areaForTab('config')).toBeNull();
  });

  it('o primeiro balão do Plano fica acima da lista inteira, com o anel na primeira linha', () => {
    // Um grupo de estudo põe o cabeçalho dele logo acima da primeira linha: ancorar na
    // linha cobriria o cabeçalho (e o clique nele) — na lista, o balão fica acima de tudo.
    const [first] = tourSteps('plan');
    // Acima da BARRA do dia (não da lista): a lista tem "Janelas do dia" logo acima, no canto esquerdo,
    // e o balão alinhado à esquerda cobria esse botão.
    expect(first).toMatchObject({ anchor: '.day-events-bar', side: 'above', align: 'start' });
    expect(first!.highlight).toContain('.block-row');
  });

  it('avançar: o índice seguinte, ou null depois do último', () => {
    expect(nextTourStep('plan', 0)).toBe(1);
    expect(nextTourStep('plan', 2)).toBeNull();
    expect(nextTourStep('profile', 0)).toBeNull();
  });
});

describe('qual área mostra o tour', () => {
  it('a aba visível, enquanto não foi vista', () => {
    expect(activeTourArea({}, 'plano', ctx)).toBe('plan');
    expect(activeTourArea({ plan: true }, 'plano', ctx)).toBeNull();
    expect(activeTourArea({ plan: true }, 'perfil', ctx)).toBe('profile');
    expect(activeTourArea({ plan: true, profile: true, analytics: true }, 'analise', ctx)).toBeNull();
  });

  it('nunca durante o onboarding nem antes do app carregar', () => {
    expect(activeTourArea({}, 'plano', { onboardingOpen: true, loaded: true })).toBeNull();
    expect(activeTourArea({}, 'plano', { onboardingOpen: false, loaded: false })).toBeNull();
  });

  it('markTourSeen devolve um objeto novo e não mexe no antigo', () => {
    const antes: TutorialSeen = { plan: true };
    const depois = markTourSeen(antes, 'profile');
    expect(depois).toEqual({ plan: true, profile: true });
    expect(antes).toEqual({ plan: true });
  });

  it('normalizeTutorialSeen só aceita áreas conhecidas marcadas com true', () => {
    expect(normalizeTutorialSeen(undefined)).toEqual({});
    expect(normalizeTutorialSeen('plan')).toEqual({});
    expect(normalizeTutorialSeen(['plan'])).toEqual({});
    expect(normalizeTutorialSeen({ plan: true, profile: 'sim', analytics: 1, loja: true })).toEqual({ plan: true });
    for (const a of TOUR_AREAS) expect(normalizeTutorialSeen({ [a]: true })).toEqual({ [a]: true });
  });
});

describe('placeBalloon — onde o balão cabe', () => {
  const balloon = { width: 280, height: 120 };
  const row = { top: 449, left: 16, width: 448, height: 46 }; // a primeira linha do plano em 480px

  it('acima e alinhado à esquerda: termina 10px antes da linha, começa na borda dela', () => {
    const p = placeBalloon(row, balloon, 480, { side: 'above', align: 'start' });
    expect(p).toEqual({ side: 'above', top: 449 - 10 - 120, left: 16, arrowX: 240 - 16 });
  });

  it('abaixo e alinhado à direita: encosta na borda direita do elemento', () => {
    const btn = { top: 381, left: 394, width: 70, height: 26 };
    const p = placeBalloon(btn, balloon, 480, { side: 'below', align: 'end' });
    expect(p.side).toBe('below');
    expect(p.top).toBe(381 + 26 + 10);
    expect(p.left).toBe(394 + 70 - 280);
    expect(p.arrowX).toBe(429 - 184); // no centro do botão, relativo ao balão
    // Elemento colado na borda direita da tela: a seta para antes do canto.
    const canto = placeBalloon({ top: 381, left: 460, width: 20, height: 26 }, balloon, 480, { side: 'below', align: 'end' });
    expect(canto.left).toBe(480 - 280 - TOUR_MARGIN);
    expect(canto.arrowX).toBe(280 - 18);
  });

  it('centralizado, e clampado na tela quando o elemento está na borda', () => {
    const p = placeBalloon({ top: 300, left: 16, width: 448, height: 47 }, balloon, 480, { side: 'above', align: 'center' });
    expect(p.left).toBe(100);
    const borda = placeBalloon({ top: 300, left: 0, width: 40, height: 40 }, balloon, 480, { side: 'above', align: 'center' });
    expect(borda.left).toBe(TOUR_MARGIN);
    expect(borda.arrowX).toBe(18);
  });

  it('vira pra baixo quando não cabe acima do topo do documento', () => {
    const p = placeBalloon({ top: 60, left: 16, width: 448, height: 40 }, balloon, 480, { side: 'above', align: 'start' });
    expect(p.side).toBe('below');
    expect(p.top).toBe(60 + 40 + 10);
  });

  it('em 480px o balão nunca sai da tela, seja qual for o elemento', () => {
    const anchors = [
      { top: 500, left: -20, width: 30, height: 30 },
      { top: 500, left: 470, width: 60, height: 30 },
      { top: 500, left: 16, width: 448, height: 30 },
    ];
    for (const a of anchors) {
      for (const align of ['start', 'center', 'end'] as const) {
        const p = placeBalloon(a, balloon, 480, { side: 'below', align });
        expect(p.left).toBeGreaterThanOrEqual(TOUR_MARGIN);
        expect(p.left + balloon.width).toBeLessThanOrEqual(480 - TOUR_MARGIN);
        expect(p.arrowX).toBeGreaterThanOrEqual(0);
        expect(p.arrowX).toBeLessThanOrEqual(balloon.width);
      }
    }
  });

  it('tela mais estreita que o balão: encosta na margem esquerda', () => {
    const p = placeBalloon(row, { width: 280, height: 100 }, 260, { side: 'below', align: 'center' });
    expect(p.left).toBe(TOUR_MARGIN);
  });
});

describe('casos de uso', () => {
  const AGORA = new Date('2026-09-02T17:30:00');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiTab: 'plano', uiWeek: 1, uiDay: 2 });
    derived.weeks = [];
    derived.onboardingOpen = false;
    rebuildWeeks(AGORA);
  });

  it('currentTourArea lê o store: aba, onboarding, carregado', () => {
    expect(currentTourArea()).toBe('plan');
    derived.onboardingOpen = true;
    expect(currentTourArea()).toBeNull();
    derived.onboardingOpen = false;
    state.uiTab = 'perfil';
    expect(currentTourArea()).toBe('profile');
    derived.weeks = [];
    expect(currentTourArea()).toBeNull();
  });

  it('finishTour marca a área, salva e notifica; repetir não faz nada', () => {
    const v = getVersion();
    finishTour('plan');
    expect(state.tutorialSeen).toEqual({ plan: true });
    expect(derived.save.text).toBe('Salvando...');
    expect(getVersion()).toBeGreaterThan(v);
    expect(currentTourArea()).toBeNull();
    const v2 = getVersion();
    finishTour('plan');
    expect(getVersion()).toBe(v2);
  });

  it('restartTour zera tudo e o tour do Plano volta', () => {
    finishTour('plan');
    finishTour('profile');
    restartTour();
    expect(state.tutorialSeen).toEqual({});
    expect(currentTourArea()).toBe('plan');
  });

  it('cancelar a sessão não zera o tour — quem cancelou já conhece o app', () => {
    finishTour('plan');
    cancelSession();
    expect(state.tutorialSeen).toEqual({ plan: true });
    derived.onboardingOpen = false;
  });
});
