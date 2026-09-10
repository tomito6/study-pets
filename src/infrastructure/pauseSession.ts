// A pausa em andamento fica no dispositivo (`localStorage`, por uid): o timer não
// sobrevive a um reload, mas a pausa sobrevive — ao abrir o app, ele volta pausado
// e o usuário retoma ou para. Pausar e dar F5 não pode ser punido com o timer
// sumindo. Não vai pro doc: a duração ainda não existe enquanto a pausa está aberta.

import { createDeviceSlot } from './deviceSlot';
import type { KeyValueStorage } from './memory/userRepository';

const slot = createDeviceSlot('study-pets:pause:');

/** Só pra testes: injeta um storage (ou `null` pra usar o Map em memória). */
export const usePauseStorage = (s: KeyValueStorage | null): void => slot.useStorage(s);
export const readPauseSession = (uid: string): unknown | null => slot.read(uid);
export const writePauseSession = (uid: string, session: unknown): void => slot.write(uid, session);
export const clearPauseSession = (uid: string): void => slot.clear(uid);
