// Apagar a conta: o documento primeiro, depois o usuário do Auth. A ordem importa —
// depois do deleteUser não sobra credencial pra passar nas regras do Firestore.

import { auth, DeleteAccountError, users } from '../infrastructure';
import { state } from '../store/store';
import { blockSaves, cancelPendingSave } from './save';
import { unsubscribeRemote } from './sync';
import { stopTimer } from './timer';

export type DeleteAccountResult = 'ok' | 'no-user' | 'data-failed' | 'reauth-failed' | 'delete-failed';

export async function deleteAccount(onStatus: (stage: 'deleting' | 'reauth') => void): Promise<DeleteAccountResult> {
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
    await auth.deleteCurrentUser({ onReauthRequired: () => onStatus('reauth') });
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
