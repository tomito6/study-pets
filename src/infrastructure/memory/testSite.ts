// O que o SITE DE TESTE faz antes de o app ler a conta (ver "O site de teste" no
// CLAUDE.md): sem conta guardada, ele nasce com o PERSONAGEM PRONTO (domain/demoAccount.ts)
// em vez do onboarding. Quem quer testar justamente o onboarding e os tours pede uma
// conta nova — pela etiqueta "site de teste" no topo da tela, ou por `?conta=nova`.
//
//   ?conta=nova    → apaga a conta de teste e começa do zero (onboarding, tours)
//   ?conta=pronta  → apaga a conta de teste e volta pro personagem pronto
//
// O parâmetro sai do endereço depois de aplicado: recarregar a página no meio de um
// teste não pode apagar tudo de novo.

import { demoAccount } from '../../domain/demoAccount';
import { serializeState } from '../../domain/persistence';
import type { KeyValueStorage } from './userRepository';
import { MEMORY_DOC_PREFIX } from './userRepository';

export type TestAccountKind = 'nova' | 'pronta';

export const ACCOUNT_PARAM = 'conta';
/** Guarda que a pessoa pediu conta nova: um reload no meio do onboarding não vira personagem pronto. */
const KIND_KEY = 'study-pets:teste-conta';
/** O que é DESTA conta e mora no dispositivo, fora do documento: a sessão hardcore e a pausa aberta. */
const DEVICE_PREFIXES = ['study-pets:hardcore:', 'study-pets:pause:'];

const isKind = (v: string | null): v is TestAccountKind => v === 'nova' || v === 'pronta';

/** O tipo de conta pedido no endereço, ou null. */
export function accountKindFromSearch(search: string): TestAccountKind | null {
  const v = new URLSearchParams(search).get(ACCOUNT_PARAM);
  return isKind(v) ? v : null;
}

/** O mesmo endereço sem o pedido de conta (os outros parâmetros, como `?tema=`, ficam). */
export function searchWithoutAccount(search: string): string {
  const p = new URLSearchParams(search);
  p.delete(ACCOUNT_PARAM);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/**
 * Deixa o storage como o pedido manda e, sem conta guardada, grava o personagem pronto.
 * Devolve o que fez — só pra teste e pra quem chama saber.
 */
export function prepareTestAccount(
  storage: KeyValueStorage,
  uid: string,
  requested: TestAccountKind | null,
  now: Date,
): 'kept' | 'seeded' | 'empty' {
  if (requested) {
    storage.removeItem(MEMORY_DOC_PREFIX + uid);
    for (const p of DEVICE_PREFIXES) storage.removeItem(p + uid);
    if (requested === 'nova') storage.setItem(KIND_KEY, 'nova');
    else storage.removeItem(KIND_KEY);
  }
  if (storage.getItem(MEMORY_DOC_PREFIX + uid)) return 'kept';
  if (storage.getItem(KIND_KEY) === 'nova') return 'empty';
  storage.setItem(MEMORY_DOC_PREFIX + uid, JSON.stringify(serializeState(demoAccount(now))));
  return 'seeded';
}

/** O boot do site de teste: lê o pedido do endereço, aplica, e limpa o endereço. */
export function bootTestSite(storage: KeyValueStorage | null, uid: string, now: Date = new Date()): void {
  if (!storage || typeof location === 'undefined') return;
  const requested = accountKindFromSearch(location.search);
  prepareTestAccount(storage, uid, requested, now);
  if (requested && typeof history !== 'undefined') {
    history.replaceState(null, '', location.pathname + searchWithoutAccount(location.search) + location.hash);
  }
}

/** Recomeça o site de teste com a conta pedida. É o que a etiqueta do topo chama. */
export function restartTestSite(kind: TestAccountKind): void {
  if (typeof location === 'undefined') return;
  location.assign(`${location.pathname}?${ACCOUNT_PARAM}=${kind}`);
}
