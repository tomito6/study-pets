// Auth via Google e via e-mail/senha, por cima do Firebase Auth.

import type { FirebaseApp } from 'firebase/app';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { AuthError, authErrorReasonFromCode } from '../../domain/auth';
import { isNativeApp } from '../platform';
import { DeleteAccountError, type AuthPort, type AuthUser } from '../ports';

const providerOf = (u: User): NonNullable<AuthUser['provider']> =>
  u.providerData[0]?.providerId === 'password' ? 'password' : 'google';

const toAuthUser = (u: User): AuthUser => ({
  uid: u.uid,
  displayName: u.displayName,
  email: u.email,
  provider: providerOf(u),
});

const toAuthError = (e: unknown): AuthError =>
  new AuthError(authErrorReasonFromCode((e as { code?: string } | null)?.code), e);

export function createFirebaseAuth(app: FirebaseApp): AuthPort {
  // No app nativo (Capacitor) o `getAuth` de sempre não serve: ele prepara o login por
  // popup/redirect, que carrega um iframe do Google — e dentro do WebView do iOS, servido
  // de `capacitor://localhost`, esse iframe nunca responde e o auth fica pendurado sem
  // erro nenhum (nem a tela de login aparece). `initializeAuth` só com a persistência em
  // IndexedDB não monta nada disso. No site nada muda.
  const native = isNativeApp();
  const auth = native ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);
  const provider = new GoogleAuthProvider();

  return {
    onAuthStateChanged(cb) {
      return onAuthStateChanged(auth, (u) => cb(u ? toAuthUser(u) : null));
    },

    currentUser() {
      return auth.currentUser ? toAuthUser(auth.currentUser) : null;
    },

    async signIn() {
      // Popup não existe dentro do app nativo. O login com Google ali é por plugin nativo
      // (a tela do próprio iOS) — o passo seguinte do plano; até lá a tela de login nem
      // mostra o botão, e isto é só o cinto.
      if (native) throw new Error('Login com Google ainda não existe no app nativo');
      await signInWithPopup(auth, provider);
    },

    async signUpWithEmail(email, password) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // Barato e não bloqueia nada — ver decisão em IDEIAS.md/plan.
        try {
          await sendEmailVerification(cred.user);
        } catch (e) {
          console.error('sendEmailVerification failed:', e);
        }
      } catch (e) {
        throw toAuthError(e);
      }
    },

    async signInWithEmail(email, password) {
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (e) {
        throw toAuthError(e);
      }
    },

    async sendPasswordReset(email) {
      try {
        await sendPasswordResetEmail(auth, email);
      } catch (e) {
        throw toAuthError(e);
      }
    },

    async signOut() {
      await signOut(auth);
    },

    async deleteCurrentUser(opts) {
      const user = auth.currentUser;
      if (!user) throw new DeleteAccountError('delete', new Error('no user signed in'));
      try {
        await deleteUser(user);
      } catch (e) {
        const code = (e as { code?: string } | null)?.code;
        // Firebase exige login recente pra apagar conta — reautentica e tenta de novo.
        if (code === 'auth/requires-recent-login') {
          opts?.onReauthRequired?.();
          try {
            if (providerOf(user) === 'password' && opts?.password && user.email) {
              const credential = EmailAuthProvider.credential(user.email, opts.password);
              await reauthenticateWithCredential(user, credential);
            } else if (native) {
              // Mesmo motivo do `signIn`: sem popup no app nativo.
              throw new Error('Reautenticação com Google ainda não existe no app nativo');
            } else {
              await reauthenticateWithPopup(user, provider);
            }
            await deleteUser(user);
          } catch (e2) {
            throw new DeleteAccountError('reauth', e2);
          }
        } else {
          throw new DeleteAccountError('delete', e);
        }
      }
    },
  };
}
