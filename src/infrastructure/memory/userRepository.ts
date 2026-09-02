// Repositório do modo teste. Guarda o documento no `sessionStorage` da aba:
// sobrevive a reload (e ao HMR do Vite), some quando a aba fecha. Cada aba
// nova começa como conta nova — o jeito mais rápido de testar onboarding,
// primeiro dia, primeira compra de pet.
//
// Sem `sessionStorage` (Node, testes), cai num Map em memória.

import type { UserDoc } from '../../domain/persistence';
import type { UserRepository } from '../ports';

/** O pedaço de `Storage` que usamos — dá pra injetar um fake nos testes. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = 'study-pets:teste:';

function defaultStorage(): KeyValueStorage | null {
  try {
    const s = (globalThis as { sessionStorage?: KeyValueStorage }).sessionStorage;
    if (!s) return null;
    // Alguns contextos expõem o objeto mas estouram ao usar (modo privado, iframe…).
    s.getItem(PREFIX + 'ping');
    return s;
  } catch {
    return null;
  }
}

export function createMemoryUserRepository(
  storage: KeyValueStorage | null = defaultStorage(),
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
      // O app sempre manda o documento inteiro, então o "merge" do Firestore
      // equivale a substituir campo a campo no nível de cima.
      write(uid, { ...(read(uid) ?? {}), ...structuredClone(userDoc) } as UserDoc);
    },

    async delete(uid) {
      if (!storage) fallback.delete(uid);
      else storage.removeItem(PREFIX + uid);
    },
  };
}
