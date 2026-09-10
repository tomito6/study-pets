// A sessão hardcore em andamento fica no dispositivo (`localStorage`, por uid):
// recarregar a página volta pro foco, e reabrir depois que o bloco acabou é
// abandono — sem isso, fechar a aba seria a saída de graça. Não vai pro doc do
// Firestore de propósito: é desta máquina, como a extensão que bloqueia sites.

import { createDeviceSlot } from './deviceSlot';
import type { KeyValueStorage } from './memory/userRepository';

const slot = createDeviceSlot('study-pets:hardcore:');

/** Só pra testes: injeta um storage (ou `null` pra usar o Map em memória). */
export const useHardcoreStorage = (s: KeyValueStorage | null): void => slot.useStorage(s);
export const readHardcoreSession = (uid: string): unknown | null => slot.read(uid);
export const writeHardcoreSession = (uid: string, session: unknown): void => slot.write(uid, session);
export const clearHardcoreSession = (uid: string): void => slot.clear(uid);
