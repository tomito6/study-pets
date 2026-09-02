// Escolhe a infraestrutura pelo ambiente. É o único lugar que sabe qual é qual.
//
//   VITE_PERSISTENCE=memory  → modo teste: sem Firebase, sem rede, dados só na sessão
//   (qualquer outra coisa)   → Firebase real
//
// `npm run dev:teste` sobe com o modo memória (ver .env.teste).

import { initializeApp } from 'firebase/app';
import { firebaseConfig } from './firebase/config';
import { createFirebaseAuth } from './firebase/auth';
import { createFirebaseUserRepository } from './firebase/userRepository';
import { createMemoryAuth } from './memory/auth';
import { createMemoryUserRepository } from './memory/userRepository';
import type { Infra } from './ports';

export type PersistenceMode = 'firebase' | 'memory';

export const persistenceMode: PersistenceMode =
  import.meta.env.VITE_PERSISTENCE === 'memory' ? 'memory' : 'firebase';

function build(): Infra {
  if (persistenceMode === 'memory') {
    return { auth: createMemoryAuth(), users: createMemoryUserRepository() };
  }
  const app = initializeApp(firebaseConfig);
  return { auth: createFirebaseAuth(app), users: createFirebaseUserRepository(app) };
}

export const { auth, users } = build();

export { DeleteAccountError } from './ports';
export type { AuthPort, AuthUser, UserRepository } from './ports';
