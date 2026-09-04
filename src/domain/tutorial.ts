// Tutorial contextual: o tour de balões que apresenta cada aba na primeira visita.
//
// Aqui mora só a regra: quais passos existem em cada área, a qual elemento real
// cada um se ancora, qual área está com o tour aberto agora e onde o balão cabe.
// Os textos vivem em `shared/strings.ts` (indexados pelo id do passo) e o DOM
// fica na feature — este arquivo não sabe o que é um `getBoundingClientRect`,
// só recebe retângulos e devolve coordenadas.

export type TourArea = 'plan' | 'profile' | 'analytics';
export const TOUR_AREAS: readonly TourArea[] = ['plan', 'profile', 'analytics'];

/** O que fica salvo: a área inteira vista (por "Entendi" no último balão ou "Pular"). */
export type TutorialSeen = Partial<Record<TourArea, true>>;

export type TourStepId = 'plan-blocks' | 'plan-events' | 'plan-finish' | 'profile-pet' | 'analytics-subnav';
export type TourSide = 'above' | 'below';
export type TourAlign = 'start' | 'center' | 'end';

export interface TourStep {
  id: TourStepId;
  area: TourArea;
  /** Seletor do elemento real em que o balão se posiciona. Lista separada por vírgula = o primeiro que existir. */
  anchor: string;
  /** Seletor do elemento que ganha o anel de realce, quando não é o próprio `anchor`. */
  highlight?: string;
  /** De que lado do elemento o balão prefere ficar (vira pro outro se não couber). */
  side: TourSide;
  /** Alinhamento horizontal do balão em relação ao elemento. */
  align: TourAlign;
}

/**
 * Os cinco balões. Posição é decisão de produto E de convivência: no Plano, o balão
 * acima da lista inteira (não da primeira linha: um grupo de estudo põe o cabeçalho
 * dele ali) e alinhado à esquerda deixa livres os checks, os nomes dos blocos e os
 * botões "Agrupar" / "+ Evento", que ficam à direita — nada que o usuário toca no
 * primeiro dia fica embaixo dele. O anel vai na primeira linha, que é o que o texto explica.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  // Ancorado na barra do dia (Janelas do dia / Agrupar / + Evento), não na lista: acima da lista o
  // balão cobria o botão mais à esquerda da barra. Acima da barra, ela fica livre inteira — o balão
  // cobre só o seletor de semana e as abas dos dias. O anel continua na primeira linha.
  { id: 'plan-blocks', area: 'plan', anchor: '.day-events-bar', highlight: '#blocks-list .block-row, #blocks-list .empty-day', side: 'above', align: 'start' },
  { id: 'plan-events', area: 'plan', anchor: '#add-event-btn', side: 'below', align: 'end' },
  { id: 'plan-finish', area: 'plan', anchor: '#finish-day-wrap .finish-day-btn', side: 'above', align: 'center' },
  { id: 'profile-pet', area: 'profile', anchor: '#active-pet-card, #no-active-pet', side: 'above', align: 'start' },
  { id: 'analytics-subnav', area: 'analytics', anchor: '#an-subnav', side: 'below', align: 'start' },
];

export const tourSteps = (area: TourArea): TourStep[] => TOUR_STEPS.filter((s) => s.area === area);

/** Aba do app (id do store) → área do tour. Aba desconhecida não tem tour. */
export function areaForTab(tab: string): TourArea | null {
  if (tab === 'plano') return 'plan';
  if (tab === 'perfil') return 'profile';
  if (tab === 'analise') return 'analytics';
  return null;
}

export interface TourContext {
  /** Nunca em cima do onboarding — o tour começa quando ele fecha. */
  onboardingOpen: boolean;
  /** Usuário logado e semanas montadas: antes disso não há elemento pra apontar. */
  loaded: boolean;
}

/** Qual área está com o tour na tela agora, ou null. Só a aba visível, e só se ainda não foi vista. */
export function activeTourArea(seen: TutorialSeen, tab: string, ctx: TourContext): TourArea | null {
  if (ctx.onboardingOpen || !ctx.loaded) return null;
  const area = areaForTab(tab);
  if (!area || seen[area]) return null;
  return area;
}

/** Próximo passo da área, ou null quando `index` já era o último. */
export function nextTourStep(area: TourArea, index: number): number | null {
  return index + 1 < tourSteps(area).length ? index + 1 : null;
}

/** Marca a área como vista. Devolve um objeto novo — o antigo não muda. */
export function markTourSeen(seen: TutorialSeen, area: TourArea): TutorialSeen {
  return { ...seen, [area]: true };
}

const isArea = (v: unknown): v is TourArea => typeof v === 'string' && (TOUR_AREAS as readonly string[]).includes(v);

/** Campo cru do documento → só as áreas conhecidas marcadas com `true`. */
export function normalizeTutorialSeen(raw: unknown): TutorialSeen {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: TutorialSeen = {};
  for (const [k, v] of Object.entries(raw)) if (isArea(k) && v === true) out[k] = true;
  return out;
}

// ---------------------------------------------------------------- geometria

/** Retângulo em coordenadas do documento (já somado o scroll). */
export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface BalloonPlacement {
  side: TourSide;
  top: number;
  left: number;
  /** Posição da seta, relativa à borda esquerda do balão. */
  arrowX: number;
}

/** Espaço entre o elemento e o balão, e a margem mínima até a borda da tela. */
export const TOUR_GAP = 10;
export const TOUR_MARGIN = 8;
const ARROW_INSET = 18;

/**
 * Onde o balão fica em relação ao elemento ancorado. Vira pro outro lado só se o
 * lado preferido não cabe (acima do topo do documento); horizontalmente nunca sai
 * da tela — em 480px, o balão de 280px fica sempre inteiro.
 */
export function placeBalloon(anchor: Rect, balloon: Size, viewportWidth: number, step: Pick<TourStep, 'side' | 'align'>): BalloonPlacement {
  const above = anchor.top - TOUR_GAP - balloon.height;
  const side: TourSide = step.side === 'above' && above < TOUR_MARGIN ? 'below' : step.side;
  const top = side === 'above' ? above : anchor.top + anchor.height + TOUR_GAP;

  let left =
    step.align === 'start' ? anchor.left
    : step.align === 'end' ? anchor.left + anchor.width - balloon.width
    : anchor.left + anchor.width / 2 - balloon.width / 2;
  const maxLeft = Math.max(TOUR_MARGIN, viewportWidth - balloon.width - TOUR_MARGIN);
  left = Math.min(maxLeft, Math.max(TOUR_MARGIN, left));

  const anchorCenter = anchor.left + anchor.width / 2;
  const arrowX = Math.min(balloon.width - ARROW_INSET, Math.max(ARROW_INSET, anchorCenter - left));

  return { side, top: Math.round(top), left: Math.round(left), arrowX: Math.round(arrowX) };
}
