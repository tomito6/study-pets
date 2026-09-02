// Auth via Google, por cima do Firebase Auth.

import type { FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { DeleteAccountError, type AuthPort, type AuthUser } from '../ports';

const toAuthUser = (u: User): AuthUser => ({
  uid: u.uid,
  displayName: u.displayName,
  email: u.email,
});

export function createFirebaseAuth(app: FirebaseApp): AuthPort {
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();

  return {
    onAuthStateChanged(cb) {
      return onAuthStateChanged(auth, (u) => cb(u ? toAuthUser(u) : null));
    },

    currentUser() {
      return auth.currentUser ? toAuthUser(auth.currentUser) : null;
    },

    async signIn() {
      await signInWithPopup(auth, provider);
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
            await reauthenticateWithPopup(user, provider);
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
