// Documento do usuário em `users/{uid}`, no Firestore.

import type { FirebaseApp } from 'firebase/app';
import { deleteDoc, doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import type { UserRepository } from '../ports';

export function createFirebaseUserRepository(app: FirebaseApp): UserRepository {
  const db = getFirestore(app);
  const ref = (uid: string) => doc(db, 'users', uid);

  return {
    ephemeral: false,

    async load(uid) {
      const snap = await getDoc(ref(uid));
      return snap.exists() ? snap.data() : null;
    },

    async save(uid, userDoc) {
      await setDoc(ref(uid), userDoc, { merge: true });
    },

    async delete(uid) {
      await deleteDoc(ref(uid));
    },
  };
}
