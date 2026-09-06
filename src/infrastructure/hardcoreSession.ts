// A sessão hardcore em andamento fica no dispositivo (`localStorage`, por uid):
// recarregar a página volta pro foco, e reabrir depois que o bloco acabou é
// abandono — sem isso, fechar a aba seria a saída de graça. Não vai pro doc do
// Firestore de propósito: é desta máquina, como a extensão que bloqueia sites.
// Sem `localStorage` (Node, modo privado), cai num Map em memória.

import type { KeyValueStorage } from './memory/userRepository';

const PREFIX = 'study-pets:hardcore:';

function defaultStorage(): KeyValueStorage | null {
  try {
    const s = (globalThis as { localStorage?: KeyValueStorage }).localStorage;
    if (!s) return null;
    s.getItem(PREFIX + 'ping');
    return s;
  } catch {
    return null;
  }
}

const fallback = new Map<string, string>();
let storage: KeyValueStorage | null | undefined;

const store = (): KeyValueStorage | null => (storage === undefined ? (storage = defaultStorage()) : storage);

/** Só pra testes: injeta um storage (ou `null` pra usar o Map em memória). */
export function useHardcoreStorage(s: KeyValueStorage | null): void {
  storage = s;
  fallback.clear();
}

export function readHardcoreSession(uid: string): unknown | null {
  const s = store();
  const raw = s ? s.getItem(PREFIX + uid) : fallback.get(uid) ?? null;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function writeHardcoreSession(uid: string, session: unknown): void {
  const raw = JSON.stringify(session);
  const s = store();
  try {
    if (s) s.setItem(PREFIX + uid, raw);
    else fallback.set(uid, raw);
  } catch {
    // cota cheia, modo privado — segue sem persistir
  }
}

export function clearHardcoreSession(uid: string): void {
  const s = store();
  try {
    if (s) s.removeItem(PREFIX + uid);
    else fallback.delete(uid);
  } catch {
    // idem
  }
}
