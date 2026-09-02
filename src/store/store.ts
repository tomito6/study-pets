// Estado central do app — um objeto só, compartilhado entre o React e o legado.
//
// Regra de convivência durante a migração: o objeto `state` é O MESMO que o
// `src/legacy/app.js` muta no lugar (mesmos nomes de campo: `uiTab`, `user`…).
// Quem muta chama `notify()`; o React lê via `useAppState` e re-renderiza.
// Quando o legado acabar, isto vira um store imutável de verdade.

import { useSyncExternalStore } from 'react';
import { emptyPersistedState } from '../domain/persistence';
import type { PersistedState } from '../domain/persistence';
import type { StudyBlock } from '../domain/types';
import type { Week } from '../domain/weeks';
import type { AuthUser } from '../infrastructure/ports';

export type Tab = 'plano' | 'analise' | 'perfil';
export const TABS: readonly Tab[] = ['plano', 'analise', 'perfil'];

/** Persistido + sessão + UI. Nada de modal aberto aqui: isso é estado local de componente. */
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

/**
 * Derivados e estado de runtime que não são persistidos. `weeks` é calculado por
 * `rebuildWeeks` (application/plan); `timerBlock` ainda é publicado pelo legado
 * até o timer migrar.
 */
export interface Derived {
  weeks: Week[];
  timerBlock: StudyBlock | null;
  save: SaveStatus;
  /** O provedor de auth já respondeu pelo menos uma vez (logado ou não). */
  authReady: boolean;
}

export const derived: Derived = {
  weeks: [],
  timerBlock: null,
  save: { text: '', visible: false },
  authReady: false,
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

// ---- ações usadas pela UI React ----

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

/** Legado (timer) avisa qual bloco está rodando. Some quando o timer migrar. */
export function publishTimerBlock(block: StudyBlock | null): void {
  derived.timerBlock = block;
}

export function markAuthReady(): void {
  if (derived.authReady) return;
  derived.authReady = true;
  notify();
}
