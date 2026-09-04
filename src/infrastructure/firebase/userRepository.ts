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
      // SEM merge, de propósito. `serializeState` já monta o documento inteiro, e o
      // merge do Firestore é profundo: um check desmarcado (chave que sumiu de
      // `checks[dia]`) ficava no servidor e voltava no reload — virando XP fantasma
      // quando o dia fechava. Substituir é o comportamento certo; campos legados
      // (o `skills` do v1) caem fora, e é isso mesmo: já migraram na leitura.
      await setDoc(ref(uid), userDoc);
    },

    async delete(uid) {
      await deleteDoc(ref(uid));
    },
  };
}
