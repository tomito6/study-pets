// "Check só pelo foco" — VERSÃO DE TESTE (2026-11-28) da decisão do PENDENCIAS 6: um
// estudo ou uma pausa só fica marcado quando o relógio do app termina o bloco (ou pelo
// "■ Parar por aqui", que paga os minutos vividos). O check à mão some da linha.
//
// É um interruptor DESTE dispositivo, desligado por padrão: com ele desligado o app é
// byte a byte o de sempre. Liga em Configurações → Geral, ou abrindo o app com
// `?check=foco` (e `?check=manual` desliga) — a querystring fica gravada, como o
// `?tema=` faz.
//
// O que o teste escolheu, das perguntas abertas do PENDENCIAS 6:
// - "pelo foco" = o relógio do app terminou o bloco, com o foco aberto ou fechado (a
//   decisão de 2026-11-03: sair do foco não custa o check);
// - o **evento que conta como estudo** continua com o check à mão — o timer não roda
//   evento, e sem isso a aula nunca poderia ser marcada;
// - desmarcar também some (não há botão); dia passado não se marca.

import { readCheckModePref, writeCheckModePref } from '../infrastructure/checkModePrefs';
import type { StudyBlock } from '../domain/types';
import { derived, notify } from '../store/store';

const QUERY_KEY = 'check';

/** `?check=foco` liga, `?check=manual` desliga; qualquer outra coisa não decide nada. */
function readQuery(): boolean | null {
  try {
    const search = globalThis.location?.search;
    if (!search) return null;
    const v = new URLSearchParams(search).get(QUERY_KEY);
    return v === 'foco' ? true : v === 'manual' ? false : null;
  } catch {
    return null;
  }
}

/** No boot, antes do React montar: a querystring vence (e fica gravada), senão o que está no dispositivo. */
export function initCheckMode(): boolean {
  const fromQuery = readQuery();
  if (fromQuery != null) writeCheckModePref(fromQuery);
  derived.focusOnlyCheck = fromQuery ?? readCheckModePref() ?? false;
  return derived.focusOnlyCheck;
}

export function setFocusOnlyCheck(on: boolean): void {
  derived.focusOnlyCheck = on;
  writeCheckModePref(on);
  notify();
}

export const focusOnlyCheck = (): boolean => derived.focusOnlyCheck;

/**
 * Este bloco só se marca pelo relógio do app? Estudo e pausa, com o teste ligado. O
 * evento fica de fora: o timer não roda evento, então o check dele continua à mão.
 */
export const checkOnlyByTimer = (block: Pick<StudyBlock, 'type'>): boolean =>
  derived.focusOnlyCheck && (block.type === 'estudo' || block.type === 'pausa');
