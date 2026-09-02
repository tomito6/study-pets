// Estado central do app — um objeto só, compartilhado entre o React e o legado.
//
// Regra de convivência durante a migração: o objeto `state` é O MESMO que o
// `src/legacy/app.js` muta no lugar (mesmos nomes de campo: `uiTab`, `user`…).
// Quem muta chama `notify()`; o React lê via `useAppState` e re-renderiza.
// Quando o legado acabar, isto vira um store imutável de verdade.

import { useSyncExternalStore } from 'react';
import { emptyPersistedState } from '../domain/persistence';
import type { PersistedState } from '../domain/persistence';
import type { Stats } from '../domain/stats';
import type { AuthUser } from '../infrastructure/ports';

export type Tab = 'plano' | 'analise' | 'perfil';
export const TABS: readonly Tab[] = ['plano', 'analise', 'perfil'];

/** Persistido + sessão + UI. Nada de modal aberto aqui: isso é estado local de componente. */
export interface AppState extends PersistedState {
  user: AuthUser | null;
  uiTab: Tab;
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

/**
 * Derivados que o legado calcula e o React só lê. Transitório: `stats` some daqui
 * quando o cálculo do plano migrar pra camada de aplicação e o React puder calcular.
 */
export interface Derived {
  stats: Stats | null;
  /** O provedor de auth já respondeu pelo menos uma vez (logado ou não). */
  authReady: boolean;
}

export const derived: Derived = { stats: null, authReady: false };

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

/** Chamado pelo legado depois de calcular as estatísticas. O `notify` vem do renderAll. */
export function publishStats(stats: Stats): void {
  derived.stats = stats;
}

export function markAuthReady(): void {
  if (derived.authReady) return;
  derived.authReady = true;
  notify();
}
