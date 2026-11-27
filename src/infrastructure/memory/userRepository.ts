// Repositório do modo teste. Guarda o documento no `sessionStorage` da aba:
// sobrevive a reload (e ao HMR do Vite), some quando a aba fecha. Cada aba
// nova começa como conta nova — o jeito mais rápido de testar onboarding,
// primeiro dia, primeira compra de pet.
//
// Sem `sessionStorage` (Node, testes), cai num Map em memória.
//
// No SITE DE TESTE (a prévia publicada de cada PR) quem entra é o `localStorage`
// (`browserStorage('local')`, escolhido em infrastructure/index.ts): ali a conta de
// mentira fica no navegador, por endereço — ou seja, por PR. Quem abre o link de um PR
// no celular abre uma aba nova a cada vez, e conta nova por aba seria refazer o
// onboarding inteiro em toda visita.

import type { UserDoc } from '../../domain/persistence';
import type { UserRepository } from '../ports';

/** O pedaço de `Storage` que usamos — dá pra injetar um fake nos testes. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A chave do documento é este prefixo + o uid. Exportado pro site de teste, que semeia a conta. */
export const MEMORY_DOC_PREFIX = 'study-pets:teste:';
const PREFIX = MEMORY_DOC_PREFIX;

/** O `sessionStorage` (uma conta por aba) ou o `localStorage` (uma por navegador). */
export function browserStorage(kind: 'session' | 'local'): KeyValueStorage | null {
  try {
    const g = globalThis as { sessionStorage?: KeyValueStorage; localStorage?: KeyValueStorage };
    const s = kind === 'local' ? g.localStorage : g.sessionStorage;
    if (!s) return null;
    // Alguns contextos expõem o objeto mas estouram ao usar (modo privado, iframe…).
    s.getItem(PREFIX + 'ping');
    return s;
  } catch {
    return null;
  }
}

export function createMemoryUserRepository(
  storage: KeyValueStorage | null = browserStorage('session'),
): UserRepository {
  const fallback = new Map<string, UserDoc>();

  const read = (uid: string): UserDoc | null => {
    if (!storage) return fallback.get(uid) ?? null;
    const raw = storage.getItem(PREFIX + uid);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as UserDoc;
    } catch {
      return null;
    }
  };

  const write = (uid: string, d: UserDoc): void => {
    if (!storage) fallback.set(uid, d);
    else storage.setItem(PREFIX + uid, JSON.stringify(d));
  };

  return {
    ephemeral: true,

    async load(uid) {
      const d = read(uid);
      return d ? structuredClone(d) : null;
    },

    async save(uid, userDoc) {
      // Substitui o documento inteiro — a mesma semântica do repositório Firebase
      // (setDoc sem merge). Antes fazia um merge raso no topo, e por isso o bug do
      // check desmarcado que voltava nunca aparecia em teste nem no e2e.
      write(uid, structuredClone(userDoc));
    },

    subscribe() {
      // Cada aba é uma conta: não há outro dispositivo pra sincronizar.
      return () => {};
    },

    async delete(uid) {
      if (!storage) fallback.delete(uid);
      else storage.removeItem(PREFIX + uid);
    },
  };
}
