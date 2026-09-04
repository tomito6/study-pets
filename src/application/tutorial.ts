// Casos de uso do tour contextual: terminar uma área ("Entendi" no último balão ou
// "Pular") e ver tudo de novo. Avançar de um balão pro outro dentro da área é só
// presentação — não persiste nada — e fica no componente (ver `TourBalloon`).

import { activeTourArea, markTourSeen } from '../domain/tutorial';
import type { TourArea } from '../domain/tutorial';
import { derived, notify, state } from '../store/store';
import { scheduleSave } from './save';

/** A área cujo tour está na tela agora (aba visível, ainda não vista, sem onboarding), ou null. */
export function currentTourArea(): TourArea | null {
  return activeTourArea(state.tutorialSeen, state.uiTab, {
    onboardingOpen: derived.onboardingOpen,
    loaded: !!state.user && derived.weeks.length > 0,
  });
}

/** A área inteira fica vista e some da tela. Vale pra "Entendi" e pra "Pular". */
export function finishTour(area: TourArea): void {
  if (state.tutorialSeen[area]) return;
  state.tutorialSeen = markTourSeen(state.tutorialSeen, area);
  scheduleSave();
  notify();
}

/** "Ver o tour de novo": esquece tudo — o primeiro balão da aba visível volta na hora. */
export function restartTour(): void {
  state.tutorialSeen = {};
  scheduleSave();
  notify();
}
