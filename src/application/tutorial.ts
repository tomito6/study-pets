// Casos de uso do tour contextual: terminar uma área ("Entendi" no último balão ou
// "Pular") e ver tudo de novo. Avançar de um balão pro outro dentro da área é só
// presentação — não persiste nada — e fica no componente (ver `TourBalloon`).

import { activeTourArea, markTourSeen } from '../domain/tutorial';
import type { TourArea } from '../domain/tutorial';
import { dk } from '../domain/time';
import { derived, notify, state } from '../store/store';
import { currentDayKey, dayModeOf } from './plan';
import { scheduleSave } from './save';

/** A área cujo tour está na tela agora (aba visível, ainda não vista, sem onboarding), ou null. */
export function currentTourArea(now: Date = new Date()): TourArea | null {
  const hoje = dk(now);
  return activeTourArea(state.tutorialSeen, state.uiTab, {
    onboardingOpen: derived.onboardingOpen,
    loaded: !!state.user && derived.weeks.length > 0,
    // O tour do modo ao vivo é do DIA VISÍVEL, e só quando ele é hoje: num dia ao vivo do
    // mês passado a âncora nem existe, o balão viraria cartão de rodapé e "Entendi"
    // queimaria a área — a pessoa nunca mais o veria no dia em que ele serve.
    liveHoje: currentDayKey() === hoje && dayModeOf(hoje) === 'live',
    idle: !derived.timerBlock,
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
