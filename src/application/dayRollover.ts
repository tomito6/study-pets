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
import { strings } from '../shared/strings';
import { showToast } from '../shared/toast';
import { state } from '../store/store';
import { rescheduleEndOfDayPrompt } from './dayEnd';
import { applyPendingPetXP } from './pets';
import { currentDayKey, rebuildWeeks, viewToday } from './plan';

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

/**
 * O dia virou? Então os dias que entraram na conta viram XP do pet e linha no
 * sininho — e o app para de achar que hoje é ontem.
 *
 * Quem estava olhando o dia que acabou de virar **vai junto**: a aba Plano abre
 * em hoje, e "🕘 Janelas do dia" e "✓ Encerrar o dia" só existem no dia de hoje,
 * então quem atravessava a meia-noite com o app aberto via os dois sumirem sem
 * uma palavra (recarregar consertava, o que deixava o sintoma intermitente).
 * Quem tinha navegado pra OUTRO dia de propósito fica onde estava — o dia virou,
 * a escolha dele não.
 */
function conferir(now: Date): void {
  const hoje = dk(now);
  const anterior = diaVisto;
  if (state.user && anterior && hoje !== anterior) {
    // Antes de qualquer coisa: em que dia a tela estava? Depois do `rebuildWeeks`
    // os índices podem não querer dizer mais a mesma data.
    const olhando = currentDayKey();
    diaVisto = hoje;
    applyPendingPetXP(now);
    rebuildWeeks(now); // o array foi montado com ONTEM como "hoje" (o fim do intervalo sai dele)
    if (olhando === anterior) {
      viewToday(now);
      showToast(strings.plan.dayTurned);
    }
    // O prompt de fim de dia é de UM dia: o de ontem já apareceu (ou não vinha
    // mais), e sem isto o `promptShown` de ontem calaria o de hoje.
    rescheduleEndOfDayPrompt(now);
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
