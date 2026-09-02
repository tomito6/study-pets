// Persistência do estado: salva com debounce e expõe o status pro indicador da UI.

import { serializeState } from '../domain/persistence';
import { users } from '../infrastructure';
import { derived, notify, state } from '../store/store';

const DEBOUNCE_MS = 800;
const DONE_VISIBLE_MS = 1500;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
/** Depois de apagar a conta, nenhum save pendente pode recriar o documento. */
let blocked = false;

function showStatus(text: string, done: boolean): void {
  derived.save = { text, visible: true };
  if (hideTimeout) clearTimeout(hideTimeout);
  hideTimeout = null;
  if (done) {
    hideTimeout = setTimeout(() => {
      derived.save = { ...derived.save, visible: false };
      notify();
    }, DONE_VISIBLE_MS);
  }
  notify();
}

/** Agenda um save do estado inteiro. Chamadas em sequência viram um save só. */
export function scheduleSave(): void {
  if (blocked) return;
  notify();
  showStatus('Salvando...', false);
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    saveTimeout = null;
    if (!state.user || blocked) return;
    try {
      await users.save(state.user.uid, serializeState(state));
      showStatus(users.ephemeral ? '💾 Modo teste (só nesta aba)' : 'Salvo ✓', true);
    } catch (e) {
      console.error('Save failed:', e);
      showStatus('⚠️ Erro ao salvar', true);
    }
  }, DEBOUNCE_MS);
}

export function cancelPendingSave(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = null;
}

/** true durante/depois de apagar a conta; false quando alguém loga. */
export function blockSaves(value: boolean): void {
  blocked = value;
}
