// Repositório em memória pro modo teste. Some no reload — de propósito: cada
// abertura começa como conta nova, o que é o jeito mais rápido de testar
// onboarding, primeiro dia, primeira compra de pet.

import type { UserDoc } from '../../domain/persistence';
import type { UserRepository } from '../ports';

export function createMemoryUserRepository(): UserRepository {
  const docs = new Map<string, UserDoc>();

  return {
    ephemeral: true,

    async load(uid) {
      const d = docs.get(uid);
      return d ? structuredClone(d) : null;
    },

    async save(uid, userDoc) {
      // O app sempre manda o documento inteiro, então o "merge" do Firestore
      // equivale a substituir campo a campo no nível de cima.
      docs.set(uid, { ...(docs.get(uid) ?? {}), ...structuredClone(userDoc) } as UserDoc);
    },

    async delete(uid) {
      docs.delete(uid);
    },
  };
}
