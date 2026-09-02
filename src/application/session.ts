// Casos de uso de sessão. A UI chama isto; isto chama a infraestrutura.
// O que acontece DEPOIS do login/logout (carregar dados, resetar estado) ainda
// vive no legado, no callback de onAuthStateChanged.

import { auth } from '../infrastructure';

export async function signIn(): Promise<void> {
  try {
    await auth.signIn();
  } catch (e) {
    // Popup fechado, rede fora… o usuário tenta de novo; não é erro fatal.
    console.error(e);
  }
}

export async function signOut(): Promise<void> {
  await auth.signOut();
}
