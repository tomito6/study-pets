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
/** Um save já saiu e ainda não voltou do servidor. */
let inFlight = false;

function newClientId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // sem crypto (contexto inseguro, ambiente antigo) — cai no fallback
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Identifica ESTA carga da página. Vai no `meta.writer` de cada save: o snapshot
 * que volta do servidor com o nosso id é eco da nossa escrita, não novidade de
 * outro dispositivo (ver `application/sync.ts`).
 */
export const CLIENT_ID: string = newClientId();

/** Há um save agendado (debounce) ou em voo. O sync não aplica doc remoto por cima. */
export function hasPendingSave(): boolean {
  return saveTimeout !== null || inFlight;
}

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
    inFlight = true;
    try {
      await users.save(state.user.uid, { ...serializeState(state), meta: { writer: CLIENT_ID, writtenAt: Date.now() } });
      showStatus(users.ephemeral ? '💾 Modo teste (só nesta aba)' : 'Salvo ✓', true);
    } catch (e) {
      console.error('Save failed:', e);
      showStatus('⚠️ Erro ao salvar', true);
    } finally {
      inFlight = false;
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
