// O modo **ao vivo**: o dia começa quando você aperta Começar, e um pomodoro emenda no
// outro até você dizer que parou. Nada é montado antes — o plano é consequência do que
// aconteceu, não premissa.
//
// O chão todo já existe: a janela marcada como corrida (`StudyWindow.live`), os quatro
// desligamentos do gerador, o corte do "Parar por aqui" e o XP proporcional. Aqui ficam
// só os dois verbos do modo: começar, e emendar no bloco seguinte.

import { isDayClosed } from '../domain/checks';
import { pausedMinutes } from '../domain/pauses';
import { dk, minsToTime, timeToMins } from '../domain/time';
import type { LiveRhythm, StudyBlock, StudyWindow } from '../domain/types';
import { derived, state } from '../store/store';
import { canEditDayWindows } from './dayWindows';
import { blocksForDay, clearBlockCache, dayModeOf, rebuildWeeks } from './plan';
import { saveNow } from './save';

export type LiveRefusal = 'not-live' | 'closed' | 'past' | 'busy' | 'no-room';
export type LiveStart = { ok: true; block: StudyBlock } | { ok: false; reason: LiveRefusal };

/** As janelas que a corrida de agora deixaria no dia: as anteriores (aparadas) e a nova. */
type Candidata = { ok: true; anteriores: StudyWindow[]; janela: StudyWindow } | { ok: false; reason: LiveRefusal };

/** O ritmo que a corrida de hoje roda: o da config, congelado na janela ao começar. */
export const liveRhythm = (): LiveRhythm => ({
  pomo: state.config.pomo,
  shortBreak: state.config.shortBreak,
  longBreak: state.config.longBreak,
});

const minuteOf = (d: Date): number => d.getHours() * 60 + d.getMinutes();

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
function candidata(dateKey: string, now: Date): Candidata {
  if (dayModeOf(dateKey) !== 'live') return { ok: false, reason: 'not-live' };
  if (isDayClosed(state.closedDays, dateKey)) return { ok: false, reason: 'closed' };
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return { ok: false, reason: can.reason === 'closed' ? 'closed' : 'past' };
  if (dateKey !== dk(now)) return { ok: false, reason: 'past' };
  if (derived.timerBlock) return { ok: false, reason: 'busy' };

  const ritmo = liveRhythm();
  const inicio = minuteOf(now);
  // As corridas anteriores ficam. Uma que ainda COBRE agora (o timer morreu num reload,
  // ou parou pelo ✕ da barra) é aparada em agora, nunca descartada: descartar levava
  // junto os blocos já marcados dentro dela, e o XP do dia caía em silêncio (medido:
  // +148 → +93 num "▶ Voltar" depois de um F5). Este é o único lugar fora de `chainLive`
  // e do corte do "Parar por aqui" que escreve o fim de uma corrida — e só numa corrida
  // em que nada roda, então a conta da pausa (`growLiveForPause`) nunca a vê crescer.
  const anteriores: StudyWindow[] = [];
  for (const w of runsOf(dateKey)) {
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
export function previewLive(dateKey: string, now: Date = new Date()): LiveStart {
  const c = candidata(dateKey, now);
  if (!c.ok) return c;
  const antes = state.windowOverrides[dateKey];
  state.windowOverrides[dateKey] = { studyWindows: [...c.anteriores, c.janela] };
  clearBlockCache();
  const bloco = blocksForDay(dateKey).find((b) => b.time === c.janela.start) ?? null;
  if (antes) state.windowOverrides[dateKey] = antes;
  else delete state.windowOverrides[dateKey];
  clearBlockCache();
  return bloco ? { ok: true, block: bloco } : { ok: false, reason: 'no-room' };
}

export function startLive(dateKey: string, now: Date = new Date()): LiveStart {
  const c = candidata(dateKey, now);
  if (!c.ok) return c;
  const { anteriores, janela } = c;
  state.windowOverrides[dateKey] = { studyWindows: [...anteriores, janela] };
  commit(now);

  const bloco = blocksForDay(dateKey).find((b) => b.time === janela.start) ?? null;
  if (!bloco) {
    // Um evento cravado no minuto de agora não deixa espaço. Desfaz e diz o motivo.
    if (anteriores.length > 0) state.windowOverrides[dateKey] = { studyWindows: anteriores };
    else delete state.windowOverrides[dateKey];
    commit(now);
    return { ok: false, reason: 'no-room' };
  }
  return { ok: true, block: bloco };
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
  const inicio = timeToMins(before.time);
  const idx = janelas.findIndex((w) => w.live && timeToMins(w.start) <= inicio && timeToMins(w.end) > inicio);
  if (idx < 0) return null;

  // Quanto crescer se mede pela pausa DE VERDADE, não pelo bloco já regenerado: o
  // `place` do gerador conta os minutos pausados só até o corte da janela
  // (`min(p.at + p.mins, cut) − p.at`), então uma pausa que atravessa o fim da corrida
  // aparece menor do que é — e crescer por esse número cresce de menos. Iterar também não
  // serve: cada volta revela só mais um pedaço, e a convergência é linear.
  //
  // A conta fechada tem UMA premissa, e ela é o invariante deste arquivo: **só `chainLive`
  // escreve o fim de uma corrida**, e ele sempre apara no bloco que nasceu. Enquanto isso
  // valer, a janela termina exatamente no fim do bloco em andamento. As duas janelas `live`
  // que não obedecem não chegam aqui: a que o `stopDayAt` cria num dia de ROTINA cobre
  // vários blocos, mas ali não há bloco rodando (tudo dentro dela já acabou); e o
  // "Prolongar estudos" num dia ao vivo estica a corrida além do bloco — aí a conta cresce
  // uma janela que já sobrava, o que não corta bloco nenhum, e esse caminho é justamente o
  // que a pendência do prompt de fim de dia num dia ao vivo vai fechar. Quem inventar um
  // terceiro escritor do fim da corrida tem que rever esta conta.
  //
  // Dito isso: a janela da corrida termina no fim do bloco em andamento, então
  //   fim = início + planejado + pausado_antes
  // e crescer por `pausado_total − pausado_antes` põe o fim exatamente onde o bloco
  // acabaria sem corte nenhum. Toda pausa de hoje registrada a partir do início deste
  // bloco é dele: o timer só deixa pausar o bloco que está rodando.
  const meus = (state.pauses[dateKey] ?? []).filter((r) => timeToMins(r.at) >= inicio);
  const cresceu = pausedMinutes(meus.reduce((soma, r) => soma + r.secs, 0)) - (before.paused ?? 0);
  if (cresceu <= 0) return null; // pausa curta demais pra mexer no plano (ele anda em minutos cheios)

  const copia = [...janelas];
  const janela = janelas[idx]!;
  copia[idx] = { ...janela, end: minsToTime(Math.min(timeToMins(janela.end) + cresceu, 24 * 60 - 1)) };
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
  const idx = janelas.findIndex((w) => w.live && timeToMins(w.start) <= fim && timeToMins(w.end) >= fim);
  if (idx < 0) return null;
  const atual = janelas[idx]!;
  const ritmo = atual.live!;
  const folga = timeToMins(atual.end) + ritmo.pomo + ritmo.longBreak;
  const esticar = (fim: number) => {
    const copia = [...janelas];
    copia[idx] = { ...atual, end: minsToTime(Math.min(fim, 24 * 60 - 1)) };
    state.windowOverrides[dateKey] = { studyWindows: copia };
    clearBlockCache();
  };

  esticar(folga);
  const seguinte = blocksForDay(dateKey).find((b) => b.time === endedAt && (b.type === 'estudo' || b.type === 'pausa'));
  if (!seguinte) {
    esticar(timeToMins(atual.end)); // volta a janela pro tamanho de antes
    commit(now);
    return null;
  }
  esticar(timeToMins(seguinte.endTime));
  commit(now);
  return blocksForDay(dateKey).find((b) => b.time === endedAt) ?? null;
}
