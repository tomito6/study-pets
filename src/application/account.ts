// Apagar a conta: o documento primeiro, depois o usuário do Auth. A ordem importa —
// depois do deleteUser não sobra credencial pra passar nas regras do Firestore.

import { auth, DeleteAccountError, users } from '../infrastructure';
import { state } from '../store/store';
import { blockSaves, cancelPendingSave } from './save';
import { unsubscribeRemote } from './sync';
import { stopTimer } from './timer';

export type DeleteAccountResult = 'ok' | 'no-user' | 'data-failed' | 'reauth-failed' | 'delete-failed';

/**
 * `password` só é usado (e só é pedido pela UI) quando o provedor da conta é
 * 'password' — é o que a reautenticação exige nesse caso, no lugar do popup
 * do Google.
 */
export async function deleteAccount(
  onStatus: (stage: 'deleting' | 'reauth') => void,
  password?: string,
): Promise<DeleteAccountResult> {
  const user = auth.currentUser() ?? state.user;
  if (!user) return 'no-user';

  onStatus('deleting');
  blockSaves(true); // trava saves pendentes pra não recriar o doc
  cancelPendingSave();
  unsubscribeRemote(); // o snapshot do doc apagado não tem o que aplicar
  stopTimer();

  try {
    await users.delete(user.uid);
  } catch (e) {
    console.error('Delete doc failed:', e);
    blockSaves(false);
    return 'data-failed';
  }

  try {
    await auth.deleteCurrentUser({ onReauthRequired: () => onStatus('reauth'), password });
  } catch (e) {
    if (e instanceof DeleteAccountError && e.stage === 'reauth') {
      console.error('Reauth/delete failed:', e.cause);
      return 'reauth-failed';
    }
    console.error('Delete user failed:', e instanceof DeleteAccountError ? e.cause : e);
    return 'delete-failed';
  }
  return 'ok';
}
