// O "check só pelo foco" (versão de teste, 2026-11-28) ligado ou desligado NESTE
// dispositivo (`localStorage`, chave `sp-check-mode`) — como o tema e o volume. É um
// teste de produto, não um dado da conta: nada disso vai pro documento na nuvem, e
// desligar devolve o app exatamente ao que era.
//
// A leitura normaliza: o que vier de fora vira `null`, e quem lê usa o padrão
// (desligado). Nunca lança.

import { createDeviceSlot } from './deviceSlot';

const slot = createDeviceSlot('sp-');
/** O "uid" fixo: a preferência é do aparelho, não da conta. A chave final é `sp-check-mode`. */
const KEY = 'check-mode';

/** `true`/`false` gravado, ou `null` pra qualquer outra coisa. */
export function normalizeCheckMode(v: unknown): boolean | null {
  if (!v || typeof v !== 'object') return null;
  const { focusOnly } = v as { focusOnly?: unknown };
  return typeof focusOnly === 'boolean' ? focusOnly : null;
}

export function readCheckModePref(): boolean | null {
  return normalizeCheckMode(slot.read(KEY));
}

export function writeCheckModePref(focusOnly: boolean): void {
  slot.write(KEY, { focusOnly });
}

/** Só pra testes: apaga a preferência gravada. */
export function clearCheckModePref(): void {
  slot.clear(KEY);
}
