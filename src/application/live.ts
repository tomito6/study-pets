// O modo **ao vivo**: o dia começa quando você aperta Começar, e um pomodoro emenda no
// outro até você dizer que parou. Nada é montado antes — o plano é consequência do que
// aconteceu, não premissa.
//
// O chão todo já existe: a janela marcada como corrida (`StudyWindow.live`), os quatro
// desligamentos do gerador, o corte do "Parar por aqui" e o XP proporcional. Aqui ficam
// só os dois verbos do modo: começar, e emendar no bloco seguinte.

import { isDayClosed } from '../domain/checks';
import { dk, minsToTime, timeToMins } from '../domain/time';
import type { LiveRhythm, StudyBlock, StudyWindow } from '../domain/types';
import { derived, state } from '../store/store';
import { rhythmOf } from '../domain/configHistory';
import { modeForDay } from '../domain/dayMode';
import { changeInEffect } from '../domain/dayRhythm';
import { grownRunWindows, stopDayAt } from '../domain/dayWindows';
import { canStartBlock } from '../domain/timer';
import { canEditDayWindows, effectiveWindows, isRestDayKey } from './dayWindows';
import { blocksForDay, clearBlockCache, configAtDay, dayModeOf, rebuildWeeks, rhythmAtDay } from './plan';
import { saveNow } from './save';
import { startContextFor } from './timer';

export type LiveRefusal = 'not-live' | 'closed' | 'past' | 'busy' | 'no-room';
export type LiveStart = { ok: true; block: StudyBlock } | { ok: false; reason: LiveRefusal };

/**
 * `fromRoutine`: a corrida pode abrir num dia que ainda está **pela rotina** — é o
 * "▶ Estudar agora" (ver `canStudyNow`). Sem ela, só um dia que já é ao vivo começa.
 */
export interface LiveOptions {
  fromRoutine?: boolean;
}

/** As janelas que a corrida de agora deixaria no dia: as anteriores (aparadas) e a nova. */
type Candidata = { ok: true; anteriores: StudyWindow[]; janela: StudyWindow } | { ok: false; reason: LiveRefusal };

const minuteOf = (d: Date): number => d.getHours() * 60 + d.getMinutes();

/**
 * O ritmo que uma corrida aberta AGORA roda, congelado na janela ao começar: o do dia —
 * o próprio dele, se o modal "🕘 Estrutura do dia" deu um, senão a rotina que vale hoje.
 */
export const liveRhythm = (now: Date = new Date()): LiveRhythm => rhythmAtDay(dk(now), minuteOf(now));

/** As janelas de corrida já registradas hoje (as corridas anteriores do dia). */
const runsOf = (dateKey: string) => (state.windowOverrides[dateKey]?.studyWindows ?? []).filter((w) => w.live);

/**
 * Há uma corrida ainda ABERTA no minuto de agora — a janela cobre `now`, mas nada roda.
 * É o que sobra de um reload no meio de um bloco (o timer é runtime e morre com a
 * página) ou de um "✕ Parar" pela barra. Nesse estado o cartão Começar não deve
 * aparecer: a porta certa é o "▶ Iniciar" da linha do bloco, que retoma a mesma corrida.
 */
export function liveRunOpen(dateKey: string, now: Date = new Date()): boolean {
  const m = minuteOf(now);
  return runsOf(dateKey).some((w) => timeToMins(w.start) <= m && m < timeToMins(w.end));
}

function commit(now: Date): void {
  clearBlockCache();
  rebuildWeeks(now); // a data ganha dados — e notifica
  void saveNow(); // sem debounce: um F5 no meio da corrida não pode perder onde ela começou
}

/**
 * "▶ Começar": abre a corrida agora. A janela vai do minuto de agora até o fim do
 * primeiro pomodoro — e não além, porque o que vem depois ainda não aconteceu. Quem a
 * estica, bloco a bloco, é `chainLive`.
 */
function candidata(dateKey: string, now: Date, opts: LiveOptions = {}): Candidata {
  const daRotina = dayModeOf(dateKey) !== 'live';
  if (daRotina && !(opts.fromRoutine && canStudyNow(dateKey, now))) return { ok: false, reason: 'not-live' };
  if (isDayClosed(state.closedDays, dateKey)) return { ok: false, reason: 'closed' };
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return { ok: false, reason: can.reason === 'closed' ? 'closed' : 'past' };
  if (dateKey !== dk(now)) return { ok: false, reason: 'past' };
  if (derived.timerBlock) return { ok: false, reason: 'busy' };

  const ritmo = liveRhythm(now);
  const inicio = minuteOf(now);
  // As corridas anteriores ficam. Uma que ainda COBRE agora (o timer morreu num reload,
  // ou parou pelo ✕ da barra) é aparada em agora, nunca descartada: descartar levava
  // junto os blocos já marcados dentro dela, e o XP do dia caía em silêncio (medido:
  // +148 → +93 num "▶ Voltar" depois de um F5). Este é o único lugar fora de `chainLive`
  // e do corte do "Parar por aqui" que escreve o fim de uma corrida — e só numa corrida
  // em que nada roda, então a conta da pausa (`growLiveForPause`) nunca a vê crescer.
  const anteriores: StudyWindow[] = [];
  for (const w of daRotina ? livedRoutine(dateKey, now) : runsOf(dateKey)) {
    const fim = timeToMins(w.end);
    if (fim <= inicio) anteriores.push(w);
    else if (timeToMins(w.start) < inicio) anteriores.push({ ...w, end: minsToTime(inicio) });
  }
  const janela = { start: minsToTime(inicio), end: minsToTime(inicio + ritmo.pomo), live: ritmo };
  return { ok: true, anteriores, janela };
}

/**
 * O que "▶ Começar" faria agora, SEM escrever nada: o bloco que nasceria, ou o motivo
 * da recusa. É o que o consentimento do hardcore mostra antes de a corrida existir.
 *
 * Existe porque a corrida era gravada (e salva) antes do consentimento: "Cancelar" no
 * modal deixava um bloco fantasma no plano — sem timer, sem check — e o cartão contava
 * mais um pomodoro. O dia é gerado com o override candidato só pelo tempo de achar o
 * bloco, e volta ao que era; o cache do gerador é limpo nas duas pontas.
 */
export function previewLive(dateKey: string, now: Date = new Date(), opts: LiveOptions = {}): LiveStart {
  const c = candidata(dateKey, now, opts);
  if (!c.ok) return c;
  const antes = state.windowOverrides[dateKey];
  state.windowOverrides[dateKey] = { studyWindows: [...c.anteriores, c.janela] };
  clearBlockCache();
  const bloco = blocksForDay(dateKey).find((b) => b.time === c.janela.start && b.type === 'estudo') ?? null;
  if (antes) state.windowOverrides[dateKey] = antes;
  else delete state.windowOverrides[dateKey];
  clearBlockCache();
  return bloco ? { ok: true, block: bloco } : { ok: false, reason: 'no-room' };
}

export function startLive(dateKey: string, now: Date = new Date(), opts: LiveOptions = {}): LiveStart {
  const c = candidata(dateKey, now, opts);
  if (!c.ok) return c;
  const { anteriores, janela } = c;
  // O dia de rotina que abre uma corrida passa a ser ao vivo dali em diante (ver `canStudyNow`).
  // O que havia antes fica guardado pra desfazer se não houver espaço: num dia de rotina o
  // override pode nem existir, e as janelas aparadas não são o que estava lá.
  const overrideAntes = state.windowOverrides[dateKey];
  const modoAntes = state.dayModes[dateKey];
  const eraRotina = dayModeOf(dateKey) !== 'live';
  state.windowOverrides[dateKey] = { studyWindows: [...anteriores, janela] };
  if (eraRotina) {
    // A escolha do dia só é gravada quando o padrão não diz a mesma coisa (a régua do `setDayMode`).
    if (modeForDay(dateKey, undefined, state.dayModeDefault) === 'live') delete state.dayModes[dateKey];
    else state.dayModes[dateKey] = 'live';
  }
  commit(now);

  // Só um ESTUDO serve: com um compromisso começando exatamente em agora, o bloco achado
  // nesse horário era o próprio compromisso, e a corrida "começava" num evento.
  const bloco = blocksForDay(dateKey).find((b) => b.time === janela.start && b.type === 'estudo') ?? null;
  if (!bloco) {
    // Um evento cravado no minuto de agora não deixa espaço. Desfaz e diz o motivo.
    if (eraRotina) {
      if (overrideAntes) state.windowOverrides[dateKey] = overrideAntes;
      else delete state.windowOverrides[dateKey];
      if (modoAntes) state.dayModes[dateKey] = modoAntes;
      else delete state.dayModes[dateKey];
    } else if (anteriores.length > 0) state.windowOverrides[dateKey] = { studyWindows: anteriores };
    else delete state.windowOverrides[dateKey];
    commit(now);
    return { ok: false, reason: 'no-room' };
  }
  return { ok: true, block: bloco };
}

/**
 * "▶ Estudar agora" (2026-11-26): hoje está **pela rotina** e o plano não tem mais nada
 * que dê pra iniciar — todo estudo e toda pausa já terminaram, ou o dia foi cortado pelo
 * "■ Parar por aqui". Até aqui esse estado não tinha porta: tocar num bloco dizia "Este
 * bloco já terminou", e o único jeito de estudar era descobrir 🕘 Estrutura do dia →
 * ⏱ Ao vivo → ▶ Começar. Quem cria a conta às 21h nascia exatamente aí, com o dia
 * inteiro no passado; e quem parava pra almoçar lia "Dá pra voltar mais tarde" sem ter
 * por onde voltar.
 *
 * A porta abre uma corrida agora, e o dia passa a ser ao vivo dali em diante — o mesmo
 * destino do caminho escondido, num toque. O que muda em relação a ele: o que já passou
 * fica INTEIRO, marcado ou não (o corte é em agora, `livedRoutine`), porque quem estudou
 * longe do computador ainda vai marcar a manhã.
 *
 * Fora daqui: dia de folga (a porta de lá continua sendo abrir janelas), dia com bloco
 * ainda por começar (a porta é a linha dele) e o hardcore não muda nada — quem atende é
 * o Plano, pelo mesmo consentimento do cartão do ao vivo.
 */
export function canStudyNow(dateKey: string, now: Date = new Date()): boolean {
  if (dateKey !== dk(now) || dayModeOf(dateKey) === 'live') return false;
  if (derived.timerBlock || isRestDayKey(dateKey) || !canEditDayWindows(dateKey, now).ok) return false;
  return !blocksForDay(dateKey).some(
    (b) => (b.type === 'estudo' || b.type === 'pausa') && canStartBlock(b, dateKey, now, startContextFor(b, dateKey)).ok,
  );
}

/**
 * O que um dia de ROTINA já viveu até agora, como fato: o mesmo corte do "■ Parar por
 * aqui" (`stopDayAt`) — a janela que já acabou fica inteira (`whole`: gerada como a rotina
 * que foi), a que agora atravessa é aparada e vira corrida; uma janela que já é corrida
 * guarda o ritmo dela. Nada vivido (a rotina inteira no futuro) = lista vazia.
 */
function livedRoutine(dateKey: string, now: Date): StudyWindow[] {
  const r = stopDayAt(effectiveWindows(dateKey), now, rhythmOf(configAtDay(dateKey)));
  return r.ok ? r.windows : [];
}

/**
 * A pausa do timer caiu DENTRO de uma corrida: a janela cresce pelos minutos que ela
 * acrescentou ao plano.
 *
 * Numa rotina a janela é o dia inteiro e sobra espaço; numa corrida a janela vai só até o
 * fim do bloco em andamento — ela não tem futuro, por definição. Sem esticar, o bloco
 * esticado pela pausa bate no fim da janela e é CORTADO: o estudo encolhe (XP a menos do
 * que a pessoa estudou) e, pior, nada nasce onde ele acabou, então `chainLive` não acha o
 * bloco seguinte, a corrente para e o foco fecha no meio do dia.
 *
 * Devolve o dia regenerado quando esticou, `null` quando não havia corrida a esticar.
 */
export function growLiveForPause(dateKey: string, before: StudyBlock, _after: StudyBlock[], now: Date = new Date()): StudyBlock[] | null {
  const janelas = state.windowOverrides[dateKey]?.studyWindows;
  if (!janelas) return null;
  // A conta é `grownRunWindows` (domain/dayWindows.ts): mede o crescimento pela pausa DE
  // VERDADE, não pelo bloco regenerado — o `place` do gerador conta os minutos pausados só
  // até o corte da janela, então uma pausa que atravessa o fim da corrida aparece menor do
  // que é, e crescer por esse número cresce de menos. Iterar também não serve: cada volta
  // revela só mais um pedaço. A conta fecha em uma passada porque a janela da corrida termina
  // exatamente no fim do bloco em andamento — o invariante deste arquivo: **só `chainLive`
  // escreve o fim de uma corrida**, e ele sempre apara no bloco que nasceu. As duas janelas
  // `live` que não obedecem não chegam aqui: a que o `stopDayAt` cria num dia de ROTINA
  // cobre vários blocos, mas ali não há bloco rodando; e o "Prolongar estudos" num dia ao
  // vivo estica a corrida além do bloco — aí a conta cresce uma janela que já sobrava, o
  // que não corta bloco nenhum. Quem inventar um terceiro escritor do fim da corrida tem
  // que rever esta conta. A mesma função serve a prévia de "retomar agora" (`pauseOutlookNow`),
  // que precisa saber onde a corrida terminaria SEM escrever nada.
  const copia = grownRunWindows(janelas, before.time, before.paused ?? 0, state.pauses[dateKey] ?? []);
  if (!copia) return null; // fora de corrida, ou pausa curta demais pra mexer no plano (ele anda em minutos cheios)
  state.windowOverrides[dateKey] = { studyWindows: copia };
  clearBlockCache();
  void now;
  return blocksForDay(dateKey);
}

/**
 * O bloco acabou: a corrida cresce pelo bloco seguinte e o timer emenda nele.
 *
 * A duração do próximo bloco **não é calculada aqui** — seria duplicar o ritmo do
 * pomodoro (quando entra a pausa longa, o que a pausa registrada faz com o fim). Em vez
 * disso a janela é esticada com folga, o dia é regenerado, e ela é aparada no bloco que
 * de fato nasceu começando onde este acabou. O gerador continua sendo a única fonte.
 *
 * Devolve `null` quando não há o que emendar — um evento no caminho, o fim do dia.
 */
export function chainLive(dateKey: string, endedAt: string, now: Date = new Date()): StudyBlock | null {
  const janelas = state.windowOverrides[dateKey]?.studyWindows ?? [];
  // A janela que CONTÉM o minuto em que o bloco acabou, não a que termina nele: uma pausa
  // registrada no meio da corrida move esse minuto, e comparar o fim exato fazia a emenda
  // devolver null — a corrente parava sozinha e o foco fechava no meio do dia.
  const fim = timeToMins(endedAt);
  const idx = janelas.findIndex((w) => w.live && !w.live.whole && timeToMins(w.start) <= fim && timeToMins(w.end) >= fim);
  if (idx < 0) return null;
  const atual = janelas[idx]!;
  // A folga cobre o maior bloco que pode nascer aqui: pelo ritmo da corrida, ou pelo ritmo
  // que o dia passou a ter no meio dela (o gerador aplica a troca por cima do da janela).
  const ritmo = atual.live!;
  const novo = changeInEffect(state.dayRhythms?.[dateKey], fim) ?? ritmo;
  const folga = timeToMins(atual.end) + Math.max(ritmo.pomo, novo.pomo) + Math.max(ritmo.longBreak, novo.longBreak);
  // O dia voltou pra rotina com a corrida ainda rodando (`setDayMode` → `routineAfter`): há
  // uma janela de rotina começando exatamente onde a corrida acaba, com o resto do dia já
  // montado. Sem olhar pra ela, a corrida crescia POR CIMA — duas janelas sobrepostas, dois
  // blocos no mesmo horário, e os pomodoros seguiam no ritmo carimbado na corrida pra sempre
  // ("fica em 13 minutos independente do que eu mude", 2026-10-01). Ali a corrida só termina o
  // que deve: a pausa do estudo que acabou é dela (e a rotina passa a começar depois da pausa);
  // um estudo novo já é do plano.
  const colada = timeToMins(atual.end) === fim ? janelas.findIndex((w, i) => i !== idx && !w.live && timeToMins(w.start) === fim) : -1;
  const esticar = (ate: number, rotinaDesde: number | null = null) => {
    const copia: StudyWindow[] = [];
    janelas.forEach((w, i) => {
      if (i === idx) copia.push({ ...atual, end: minsToTime(Math.min(ate, 24 * 60 - 1)) });
      else if (i !== colada) copia.push(w);
      else if (rotinaDesde !== null && rotinaDesde < timeToMins(w.end)) copia.push({ ...w, start: minsToTime(rotinaDesde) });
      // rotinaDesde === null: a janela colada fica de fora (é só a tentativa); senão, ela começa onde a corrida passou a acabar
    });
    state.windowOverrides[dateKey] = { studyWindows: copia };
    clearBlockCache();
  };
  const desfazer = () => {
    state.windowOverrides[dateKey] = { studyWindows: janelas };
    clearBlockCache();
  };
  const ehParte = (b: StudyBlock) => b.time === endedAt && (b.type === 'estudo' || b.type === 'pausa');

  esticar(folga); // a tentativa: só a corrida, com folga
  const seguinte = blocksForDay(dateKey).find(ehParte);
  if (colada >= 0) {
    if (seguinte && seguinte.type === 'pausa') {
      esticar(timeToMins(seguinte.endTime), timeToMins(seguinte.endTime));
      commit(now);
      return blocksForDay(dateKey).find(ehParte) ?? null;
    }
    desfazer(); // o próximo é um estudo: ele é do plano que já está montado
    commit(now);
    return blocksForDay(dateKey).find(ehParte) ?? null;
  }
  if (!seguinte) {
    desfazer(); // volta a janela pro tamanho de antes
    commit(now);
    return null;
  }
  esticar(timeToMins(seguinte.endTime));
  commit(now);
  return blocksForDay(dateKey).find((b) => b.time === endedAt) ?? null;
}
