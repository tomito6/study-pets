// Auth de mentira pro modo teste: já começa logado num usuário fixo, sem rede.
// Substitui o que o index_teste.html fazia com stubs vazios de login/logout.

import type { AuthPort, AuthUser, Unsubscribe } from '../ports';

export const TEST_USER: AuthUser = {
  uid: 'usuario-teste',
  displayName: 'Modo teste',
  email: null,
};

export function createMemoryAuth(initialUser: AuthUser | null = TEST_USER): AuthPort {
  let user = initialUser;
  const listeners = new Set<(u: AuthUser | null) => void>();

  // Emite de forma assíncrona, como o Firebase faz. Importa: o callback do app roda
  // `initApp()`, que depende de declarações feitas depois da inscrição no módulo.
  const emit = () => {
    const snapshot = user;
    setTimeout(() => listeners.forEach((cb) => cb(snapshot)), 0);
  };

  return {
    onAuthStateChanged(cb): Unsubscribe {
      listeners.add(cb);
      const snapshot = user;
      setTimeout(() => cb(snapshot), 0);
      return () => listeners.delete(cb);
    },

    currentUser() {
      return user;
    },

    async signIn() {
      user = TEST_USER;
      emit();
    },

    async signOut() {
      user = null;
      emit();
    },

    async deleteCurrentUser() {
      user = null;
      emit();
    },
  };
}
