// Auth de mentira pro modo teste: já começa logado num usuário fixo, sem rede.
// Também simula um cadastro de contas por e-mail/senha (registro só em memória —
// não sobrevive a reload, igual ao próprio estado de login/logout hoje).

import { AuthError } from '../../domain/auth';
import type { AuthPort, AuthUser, Unsubscribe } from '../ports';

export const TEST_USER: AuthUser = {
  uid: 'usuario-teste',
  displayName: 'Modo teste',
  email: null,
  provider: 'google',
};

interface EmailAccount {
  uid: string;
  email: string;
  password: string;
}

export function createMemoryAuth(initialUser: AuthUser | null = TEST_USER): AuthPort {
  let user = initialUser;
  const listeners = new Set<(u: AuthUser | null) => void>();
  // Registro de contas por e-mail. Uid deriva do e-mail: contas diferentes
  // viram documentos diferentes no repositório (ver memory/userRepository.ts).
  const accounts = new Map<string, EmailAccount>();

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

    async signUpWithEmail(email, password) {
      const key = email.trim().toLowerCase();
      if (accounts.has(key)) throw new AuthError('email-in-use');
      const account: EmailAccount = { uid: `email:${key}`, email: email.trim(), password };
      accounts.set(key, account);
      user = { uid: account.uid, displayName: null, email: account.email, provider: 'password' };
      emit();
    },

    async signInWithEmail(email, password) {
      const key = email.trim().toLowerCase();
      const account = accounts.get(key);
      if (!account || account.password !== password) throw new AuthError('invalid-credential');
      user = { uid: account.uid, displayName: null, email: account.email, provider: 'password' };
      emit();
    },

    async sendPasswordReset() {
      // "Envia" e resolve — não há e-mail de verdade no modo teste.
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
