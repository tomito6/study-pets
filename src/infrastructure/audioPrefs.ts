// O volume e o mudo dos sons, guardados NESTE dispositivo (`localStorage`, chave
// `sp-audio`) — como o tema, e pelo mesmo motivo: o celular no bolso e o laptop na
// mesa não querem o mesmo volume, e nada disso é do documento na nuvem. Sem
// `localStorage` (Node, modo privado) o `deviceSlot` cai num Map em memória, então
// a preferência vale só nesta carga da página e o app não sente diferença.
//
// A leitura normaliza: o que vier de fora (garbage, versão antiga, edição à mão)
// vira `null`, e quem lê usa o padrão. Nunca lança.

import type { AudioSettings } from './audio/sounds';
import { createDeviceSlot } from './deviceSlot';

const slot = createDeviceSlot('sp-');
/** O "uid" fixo: a preferência é do aparelho, não da conta. A chave final é `sp-audio`. */
const KEY = 'audio';

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** `{ volume: 0..1, muted }` válido, ou `null` pra qualquer outra coisa. */
export function normalizeAudioSettings(v: unknown): AudioSettings | null {
  if (!v || typeof v !== 'object') return null;
  const { volume, muted } = v as { volume?: unknown; muted?: unknown };
  if (typeof volume !== 'number' || !Number.isFinite(volume)) return null;
  return { volume: clamp01(volume), muted: muted === true };
}

export function readAudioPrefs(): AudioSettings | null {
  return normalizeAudioSettings(slot.read(KEY));
}

export function writeAudioPrefs(a: AudioSettings): void {
  slot.write(KEY, { volume: clamp01(a.volume), muted: a.muted });
}

/** Só pra testes: apaga a preferência gravada. */
export function clearAudioPrefs(): void {
  slot.clear(KEY);
}
