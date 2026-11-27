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
import { TEST_USER, createMemoryAuth } from './memory/auth';
import { bootTestSite } from './memory/testSite';
import { browserStorage, createMemoryUserRepository } from './memory/userRepository';
import { isTestSite } from './platform';
import type { Infra } from './ports';

export type PersistenceMode = 'firebase' | 'memory';

export const persistenceMode: PersistenceMode =
  import.meta.env.VITE_PERSISTENCE === 'memory' ? 'memory' : 'firebase';

function build(): Infra {
  if (persistenceMode === 'memory') {
    const storage = browserStorage(isTestSite() ? 'local' : 'session');
    // Antes de qualquer leitura: sem conta guardada, o site de teste nasce com o
    // personagem pronto (ou do zero, se o endereço pediu `?conta=nova`).
    if (isTestSite()) bootTestSite(storage, TEST_USER.uid);
    return { auth: createMemoryAuth(), users: createMemoryUserRepository(storage) };
  }
  const app = initializeApp(firebaseConfig);
  return { auth: createFirebaseAuth(app), users: createFirebaseUserRepository(app) };
}

export const { auth, users } = build();

export { DeleteAccountError } from './ports';
export type { AuthPort, AuthUser, UserRepository } from './ports';
