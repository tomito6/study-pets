// Estado central do app — um objeto só, mutado no lugar pelos casos de uso.
//
// Quem muta chama `notify()`; o React lê via `useAppState` e re-renderiza.
// (Herança da migração: o objeto é compartilhado e mutável. Virar um store
// imutável de verdade é um refactor possível, não necessário.)

import { useSyncExternalStore } from 'react';
import type { DaySummary } from '../domain/daySummary';
import type { HardcoreRuntime } from '../domain/hardcore';
import type { BlockingAck } from '../infrastructure/extensionBridge';
import { emptyPersistedState } from '../domain/persistence';
import type { PersistedState } from '../domain/persistence';
import type { BlockType, SiteBlockMode, StudyBlock } from '../domain/types';
import type { Week } from '../domain/weeks';
import type { AudioSettings } from '../infrastructure/audio/sounds';
import type { AuthUser } from '../infrastructure/ports';

export type Tab = 'plano' | 'analise' | 'perfil';
export const TABS: readonly Tab[] = ['plano', 'analise', 'perfil'];

/** Persistido + sessão + UI. Modal aberto por clique local NÃO vem pra cá. */
export interface AppState extends PersistedState {
  user: AuthUser | null;
  uiTab: Tab;
  /** Semana visível (1-based) e dia (0 = segunda). */
  uiWeek: number;
  uiDay: number;
}

export const state: AppState = {
  user: null,
  ...emptyPersistedState(),
  uiTab: 'plano',
  uiWeek: 1,
  uiDay: 0,
};

export interface SaveStatus {
  text: string;
  visible: boolean;
}

export interface DayEndUi {
  confirmOpen: boolean;
  promptOpen: boolean;
  promptLastEnd: string;
  summary: DaySummary | null;
}

/** O bloco que acabou de terminar no modo foco — a faixa "✓ … concluído" do overlay. */
export interface CompletedBlock {
  name: string;
  type: BlockType;
  /** Ganho do check automático (0 se o bloco já estava marcado à mão). */
  xp: number;
  coins: number;
  /** ms de quando terminou — o overlay esconde a faixa alguns segundos depois. */
  at: number;
}

/**
 * Derivados e estado de runtime que não são persistidos. Os modais que estão
 * aqui (`focusOpen`, `onboardingOpen`, `dayEnd`) são exceções conscientes: quem
 * os abre é um caso de uso, não um clique local.
 */
export interface Derived {
  weeks: Week[];
  timerBlock: StudyBlock | null;
  /** ms de quando o bloco em andamento foi pausado; null rodando. O registro no doc só nasce ao retomar. */
  timerPausedAt: number | null;
  focusOpen: boolean;
  /** Preenchido quando o foco emenda de um bloco no seguinte; limpo ao parar/iniciar. */
  timerCompleted: CompletedBlock | null;
  /** Um "Iniciar" pedido fora da lista (o cartão Agora do laptop); o PlanTab atende e limpa. */
  startRequest: StudyBlock | null;
  /** "Abrir Configurações" pedido pela barra do laptop; a SettingsPage atende e limpa. */
  settingsRequest: SettingsRequest | null;
  audio: AudioSettings;
  save: SaveStatus;
  authReady: boolean;
  onboardingOpen: boolean;
  dayEnd: DayEndUi;
  /** A sequência hardcore em andamento (o foco não tem saída livre); null fora dela. */
  hardcore: HardcoreRuntime | null;
  /** Bloqueio de sites: o que a extensão confirmou e o teste de 1 min (ver application/siteBlock.ts). */
  siteBlock: SiteBlockRuntime;
}

/** Runtime do bloqueio de sites. Nada aqui é persistido. */
/**
 * O pedido de abrir as Configurações (a engrenagem da barra, o menu do avatar, e
 * o "importe de um calendário" do Novo evento). `focus` leva a página até a seção
 * pedida — senão ela abre no topo do Geral, como sempre.
 */
export interface SettingsRequest {
  focus: 'calendar' | null;
}

export interface SiteBlockRuntime {
  /** O que a extensão respondeu ter aplicado; null sem confirmação. */
  ack: BlockingAck | null;
  /** O "▶ Testar por 1 min" em andamento: quando acaba e com que lista. */
  test: { until: number; mode: SiteBlockMode; sites: string[] } | null;
}

export const derived: Derived = {
  weeks: [],
  timerBlock: null,
  timerPausedAt: null,
  focusOpen: false,
  timerCompleted: null,
  startRequest: null,
  settingsRequest: null,
  audio: { volume: 0.7, muted: false },
  save: { text: '', visible: false },
  authReady: false,
  onboardingOpen: false,
  dayEnd: { confirmOpen: false, promptOpen: false, promptLastEnd: '', summary: null },
  hardcore: null,
  siteBlock: { ack: null, test: null },
};

let version = 0;
const listeners = new Set<() => void>();

/** Avisa quem escuta que `state`/`derived` mudaram. Idempotente e barato. */
export function notify(): void {
  version++;
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getVersion = (): number => version;

/** Hook: re-renderiza a cada `notify()` e devolve o recorte pedido. */
export function useAppState<T>(selector: (s: AppState, d: Derived) => T): T {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return selector(state, derived);
}

// ---- ações de UI ----

export function setTab(tab: Tab): void {
  if (state.uiTab === tab) return;
  state.uiTab = tab;
  notify();
}

export function setView(week: number, day: number): void {
  if (state.uiWeek === week && state.uiDay === day) return;
  state.uiWeek = week;
  state.uiDay = day;
  notify();
}

export function setDay(day: number): void {
  setView(state.uiWeek, day);
}

export function markAuthReady(): void {
  if (derived.authReady) return;
  derived.authReady = true;
  notify();
}
