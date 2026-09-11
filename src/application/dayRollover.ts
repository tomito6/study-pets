// A virada da meia-noite com o app ABERTO.
//
// Um dia entra na conta de duas formas — o botão "Encerrar o dia" e a virada do
// dia — e as duas passam por `applyPendingPetXP`. Só que ninguém o chamava na
// virada com o app aberto: os chamadores são o boot, o "Encerrar o dia", o sync e
// o Perfil ao ficar visível. Quem deixa o app aberto na aba Plano atravessando a
// meia-noite ficava sem o crédito do pet e sem uma linha no sininho até recarregar.
//
// Sem polling, no mesmo espírito do prompt de fim de dia: um `setTimeout` pro
// instante exato da virada, mais o `onVisible` — porque aba em segundo plano tem
// o timer estrangulado e o celular travado congela tudo.

import { dk } from '../domain/time';
import type { DateKey } from '../domain/types';
import { onVisible } from '../infrastructure/visibility';
import type { Unsubscribe } from '../infrastructure/ports';
import { state } from '../store/store';
import { applyPendingPetXP } from './pets';

/** Cinco segundos depois da meia-noite: nada de disputar o instante exato com o relógio. */
const FOLGA_MS = 5000;

let timer: ReturnType<typeof setTimeout> | null = null;
let unwatch: Unsubscribe | null = null;
let diaVisto: DateKey | null = null;

function agendar(now: Date): void {
  if (timer) clearTimeout(timer);
  const proxima = new Date(now);
  proxima.setHours(24, 0, 0, 0);
  timer = setTimeout(() => {
    timer = null;
    conferir(new Date());
  }, Math.max(1000, proxima.getTime() - now.getTime() + FOLGA_MS));
}

/** O dia virou? Então os dias que entraram na conta viram XP do pet e linha no sininho. */
function conferir(now: Date): void {
  const hoje = dk(now);
  if (state.user && diaVisto && hoje !== diaVisto) {
    diaVisto = hoje;
    applyPendingPetXP(now);
  } else if (diaVisto) {
    diaVisto = hoje;
  }
  agendar(now);
}

/** Chamado no boot, depois de carregar o documento. */
export function startDayRollover(now: Date = new Date()): void {
  diaVisto = dk(now);
  agendar(now);
  if (!unwatch) unwatch = onVisible(() => conferir(new Date()));
}

/** Ao sair da conta. */
export function stopDayRollover(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (unwatch) unwatch();
  unwatch = null;
  diaVisto = null;
}
