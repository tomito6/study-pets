// Um valor JSON que fica NESTE dispositivo (`localStorage`, por uid), fora do doc do
// Firestore de propósito: a sessão hardcore e a pausa em andamento são desta
// máquina, como a extensão que bloqueia sites. Sem `localStorage` (Node, modo
// privado), cai num Map em memória.

import type { KeyValueStorage } from './memory/userRepository';

export interface DeviceSlot {
  read(uid: string): unknown | null;
  write(uid: string, value: unknown): void;
  clear(uid: string): void;
  /** Só pra testes: injeta um storage (ou `null` pra usar o Map em memória). */
  useStorage(s: KeyValueStorage | null): void;
}

function defaultStorage(prefix: string): KeyValueStorage | null {
  try {
    const s = (globalThis as { localStorage?: KeyValueStorage }).localStorage;
    if (!s) return null;
    s.getItem(prefix + 'ping');
    return s;
  } catch {
    return null;
  }
}

export function createDeviceSlot(prefix: string): DeviceSlot {
  const fallback = new Map<string, string>();
  let storage: KeyValueStorage | null | undefined;
  const store = (): KeyValueStorage | null => (storage === undefined ? (storage = defaultStorage(prefix)) : storage);
  return {
    read(uid) {
      const s = store();
      const raw = s ? s.getItem(prefix + uid) : fallback.get(uid) ?? null;
      if (!raw) return null;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    },
    write(uid, value) {
      const raw = JSON.stringify(value);
      const s = store();
      try {
        if (s) s.setItem(prefix + uid, raw);
        else fallback.set(uid, raw);
      } catch {
        // cota cheia, modo privado — segue sem persistir
      }
    },
    clear(uid) {
      const s = store();
      try {
        if (s) s.removeItem(prefix + uid);
        else fallback.delete(uid);
      } catch {
        // idem
      }
    },
    useStorage(s) {
      storage = s;
      fallback.clear();
    },
  };
}
