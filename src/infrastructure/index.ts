// Escolhe a infraestrutura pelo ambiente. É o único lugar que sabe qual é qual.
//
//   VITE_PERSISTENCE=memory  → modo teste: sem Firebase, sem rede, dados só na aba
//   (qualquer outra coisa)   → Firebase real
//
// `npm run dev:teste` sobe com o modo memória (ver .env.teste). O site de teste publicado
// (a prévia de cada PR, ver .env.previa) é o mesmo modo, com a conta guardada no navegador
// em vez de na aba.

import { initializeApp } from 'firebase/app';
import { firebaseConfig } from './firebase/config';
import { createFirebaseAuth } from './firebase/auth';
import { createFirebaseUserRepository } from './firebase/userRepository';
import { createMemoryAuth } from './memory/auth';
import { browserStorage, createMemoryUserRepository } from './memory/userRepository';
import { isTestSite } from './platform';
import type { Infra } from './ports';

export type PersistenceMode = 'firebase' | 'memory';

export const persistenceMode: PersistenceMode =
  import.meta.env.VITE_PERSISTENCE === 'memory' ? 'memory' : 'firebase';

function build(): Infra {
  if (persistenceMode === 'memory') {
    const storage = browserStorage(isTestSite() ? 'local' : 'session');
    return { auth: createMemoryAuth(), users: createMemoryUserRepository(storage) };
  }
  const app = initializeApp(firebaseConfig);
  return { auth: createFirebaseAuth(app), users: createFirebaseUserRepository(app) };
}

export const { auth, users } = build();

export { DeleteAccountError } from './ports';
export type { AuthPort, AuthUser, UserRepository } from './ports';
