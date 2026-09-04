// Sincronização entre dispositivos. O documento é carregado uma vez no login e
// salvo inteiro; sem isto, celular e notebook abertos ao mesmo tempo = o último a
// salvar apaga o outro sem aviso. Aqui o repositório avisa quando o doc muda no
// servidor e o estado é reidratado — a menos que:
//
// - seja eco da nossa própria escrita (`meta.writer` = este `CLIENT_ID`);
// - repita o que já está aplicado (mesmo `meta.writtenAt`; a primeira emissão do
//   snapshot devolve o doc que acabou de ser carregado);
// - o onboarding esteja aberto (uma conta nova em duas abas: não fechar o modal
//   por baixo de quem está escolhendo o pet);
// - haja save local pendente ou em voo — v1: o local vence, e o remoto que chegou
//   nessa janela de ~1s é perdido (o nosso doc inteiro sobrescreve em seguida).
//   Se um dia doer, o caminho é escrita granular por campo.
//
// Nunca toca `derived` (timer rodando, foco aberto): isso é desta aba.

import { hydrateUserDoc, readDocMeta } from '../domain/persistence';
import { users } from '../infrastructure';
import type { Unsubscribe } from '../infrastructure/ports';
import { strings } from '../shared/strings';
import { showToast } from '../shared/toast';
import { derived, notify, state } from '../store/store';
import { applyPendingPetXP } from './pets';
import { clearBlockCache, rebuildWeeks } from './plan';
import { CLIENT_ID, hasPendingSave } from './save';

export type SyncOutcome = 'applied' | 'echo' | 'same' | 'onboarding' | 'pending-save' | 'no-user' | 'invalid';

/** O último documento que entrou no estado — pra reconhecer a mesma emissão de novo. */
let lastWrittenAt: number | null = null;
/** Doc sem carimbo (anterior a esta versão): compara o conteúdo. */
let lastFingerprint: string | null = null;

const fingerprint = (raw: unknown): string => {
  try {
    return JSON.stringify(raw) ?? '';
  } catch {
    return '';
  }
};

/** Chamado com o doc carregado no login (e com cada doc aplicado): é o "já vi este". */
export function rememberDoc(raw: unknown): void {
  const meta = readDocMeta(raw);
  lastWrittenAt = meta?.writtenAt ?? null;
  lastFingerprint = meta ? null : fingerprint(raw);
}

function isSameAsLast(raw: unknown): boolean {
  const meta = readDocMeta(raw);
  if (meta) return lastWrittenAt !== null && meta.writtenAt === lastWrittenAt;
  return lastFingerprint !== null && lastFingerprint === fingerprint(raw);
}

/** Um documento chegou do servidor. Devolve o que aconteceu (os testes leem isto). */
export function applyRemoteDoc(raw: unknown, now: Date = new Date()): SyncOutcome {
  if (!raw || typeof raw !== 'object') return 'invalid';
  if (!state.user) return 'no-user';
  const meta = readDocMeta(raw);
  if (meta?.writer === CLIENT_ID) {
    rememberDoc(raw);
    return 'echo';
  }
  if (isSameAsLast(raw)) return 'same';
  if (derived.onboardingOpen) return 'onboarding';
  if (hasPendingSave()) return 'pending-save';

  Object.assign(state, hydrateUserDoc(raw));
  rememberDoc(raw);
  rebuildWeeks(now);
  clearBlockCache();
  applyPendingPetXP(now); // idempotente — rodar de novo é seguro
  notify();
  showToast(strings.sync.updated);
  return 'applied';
}

let unsub: Unsubscribe | null = null;

/** Depois de carregar o doc: passa a escutar o servidor. Uma inscrição por vez. */
export function subscribeRemote(uid: string): void {
  unsubscribeRemote();
  unsub = users.subscribe(uid, (raw) => {
    applyRemoteDoc(raw);
  });
}

/** Ao sair ou apagar a conta. */
export function unsubscribeRemote(): void {
  if (unsub) unsub();
  unsub = null;
}
