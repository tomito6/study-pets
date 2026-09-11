// Onboarding: aparece na primeira vez (doc não existe) e ao cancelar a sessão.
// Monta o personagem, escolhe o pet inicial (quando não há pet nenhum), e as
// JANELAS DE ESTUDO + fins de semana; o resto é editável depois.
//
// O último passo era "período de uso" (duas datas) e nunca perguntava a que horas
// a pessoa estuda — então todo mundo caía no padrão 09:00–18:00, que são 16
// pomodoros e 6h40 num dia, sem ter pedido isso. As datas foram pras Configurações,
// onde já existe o texto explicando pra que servem; a janela, que é o que define o
// dia inteiro, subiu pro onboarding.
//
// A aparência chega aqui em vez de ser aplicada na hora de propósito: `setAvatar`
// salva, e um documento criado antes do onboarding terminar faria um reload pular
// o pet inicial.

import { normalizeAvatar } from '../domain/avatar';
import type { AvatarConfig } from '../domain/avatar';
import { validateDayWindows } from '../domain/dayWindows';
import { LUNCH_SERIES_ID, mealSeries } from '../domain/eventPresets';
import { PETS, normalizePetName } from '../domain/pets';
import { dk } from '../domain/time';
import type { PetId, StudyWindow } from '../domain/types';
import { derived, notify, state } from '../store/store';
import { adoptStarter, needsStarter } from './pets';
import { clearBlockCache, rebuildWeeks } from './plan';
import { scheduleSave } from './save';

export function openOnboarding(): void {
  derived.onboardingOpen = true;
  notify();
}

export interface StarterChoice {
  species: PetId;
  name: string;
}

export interface OnboardingInput {
  /** As faixas do dia em que a pessoa estuda — é o que o gerador enche de blocos. */
  studyWindows: StudyWindow[];
  skipWeekends: boolean;
  /** Obrigatório quando o usuário ainda não tem pet (ver `needsStarter`). */
  starter?: StarterChoice | null;
  /** A aparência montada no primeiro passo. Ausente = fica a que já estava. */
  avatar?: AvatarConfig | null;
  /** A declaração de idade mínima do último passo. Sem ela o onboarding não fecha. */
  ageConfirmed?: boolean;
}

export type OnboardingRefusal =
  | 'empty'
  | 'invalid-window'
  | 'overlap'
  | 'no-starter'
  | 'unknown-species'
  | 'invalid-name'
  | 'age-unconfirmed';
export type OnboardingResult = { ok: true } | { ok: false; reason: OnboardingRefusal };

/**
 * `periodStart` marca hoje como começo (é o marco que preserva progresso, e a única
 * forma de redefini-lo continua sendo cancelar a sessão); `periodEnd` nasce null —
 * o modo "sempre", que era o que quase todo mundo escolhia no passo antigo. Valida
 * tudo antes de mudar qualquer coisa.
 */
export function finishOnboarding(input: OnboardingInput, now: Date = new Date()): OnboardingResult {
  const janelas = validateDayWindows(input.studyWindows ?? []);
  if (!janelas.ok) return { ok: false, reason: janelas.reason };

  // A política de privacidade e os termos dizem "16 anos ou mais". Dizer sem nunca
  // perguntar seria meia regra — e é justamente a declaração que o art. 8 do GDPR
  // espera de um serviço deste porte, não uma verificação documental.
  if (!input.ageConfirmed && !state.ageConfirmed) return { ok: false, reason: 'age-unconfirmed' };

  const starter = needsStarter() ? input.starter ?? null : null;
  if (needsStarter()) {
    if (!starter) return { ok: false, reason: 'no-starter' };
    if (!PETS[starter.species]) return { ok: false, reason: 'unknown-species' };
    if (!normalizePetName(starter.name)) return { ok: false, reason: 'invalid-name' };
  }

  if (starter) {
    adoptStarter(starter.species, starter.name, now);
    // Conta nova (ou sessão recomeçada): a refeição das 13h já vem no plano, como o almoço
    // padrão de antes — só que é um evento, e dá pra editar ou apagar como qualquer outro.
    if (!state.eventSeries) state.eventSeries = [];
    if (!state.eventSeries.some((s) => s.id === LUNCH_SERIES_ID)) state.eventSeries.push(mealSeries('13:00', 60));
  }
  if (input.avatar) state.avatar = normalizeAvatar(input.avatar);
  if (input.ageConfirmed) state.ageConfirmed = true;
  const studyWindows = input.studyWindows.map((w) => ({ start: w.start, end: w.end }));
  state.config = {
    ...state.config,
    studyWindows,
    // Derivados, mantidos só pra retrocompat (ver domain/config.ts).
    start: studyWindows[0]!.start,
    end: studyWindows[studyWindows.length - 1]!.end,
    periodStart: dk(now),
    periodEnd: null,
    skipWeekends: input.skipWeekends,
  };
  derived.onboardingOpen = false;
  rebuildWeeks(now);
  clearBlockCache();
  scheduleSave();
  notify();
  return { ok: true };
}
