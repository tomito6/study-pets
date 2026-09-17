// Pausar o bloco em andamento — as regras puras. O timer congela (ver `timerProgress`
// com `pausedAt`); ao retomar, a pausa vira um `PauseRecord` do dia, e o gerador
// estica o bloco que a contém, empurrando o resto do dia (ver `generateBlocks`).
//
// Aqui: o registro (quanto durou, arredondado a favor de quem pausou), a leitura do
// doc, a pausa aberta que fica no dispositivo (o timer não sobrevive a reload — a
// pausa sobrevive, senão pausar e dar F5 seria punir a pausa), e a correspondência
// entre o plano de antes e o de depois — o que os checks e os grupos chaveados por
// horário precisam pra acompanhar os blocos que deslizaram.

import { blockMins, minsToTime, timeToMins } from './time';
import { cleanBlockName, eventDisplayName } from './timer';
import type { CheckRecord, DateKey, PauseRecord, PausesByDate, StudyBlock, StudyGroup, TimeString } from './types';

const isTime = (v: unknown): v is TimeString => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
const isPomodoroPart = (b: Pick<StudyBlock, 'type'>): boolean => b.type === 'estudo' || b.type === 'pausa';

/**
 * O registro de uma pausa que acabou: o minuto em que começou (pra baixo) e quanto ela
 * durou, em **segundos** (pra cima, mínimo 1 — quem pausou nunca perde tempo).
 *
 * Guardar em segundos é o que impede a pausa de inflar: quem arredonda pra minuto é o
 * gerador, uma vez, sobre a soma do bloco (ver `generateBlocks`). Com minutos por
 * registro, dez toques em Pausar/Retomar dentro de sete segundos viravam dez minutos
 * de dia empurrado.
 */
export function pauseRecordFor(pausedAt: Date, resumedAt: Date): PauseRecord {
  const at = minsToTime(pausedAt.getHours() * 60 + pausedAt.getMinutes());
  const secs = Math.max(1, Math.ceil((resumedAt.getTime() - pausedAt.getTime()) / 1000));
  return { at, secs };
}

export const sortPauses = (list: PauseRecord[]): PauseRecord[] =>
  [...list].sort((a, b) => timeToMins(a.at) - timeToMins(b.at));

/** A lista do dia com mais um registro, em ordem. */
export const addPause = (day: PauseRecord[] | undefined, record: PauseRecord): PauseRecord[] =>
  sortPauses([...(day ?? []), record]);

/** `pauses` em qualquer formato (ausente, lixo, parcial) → só registros válidos, em ordem. */
export function normalizePauses(raw: unknown): PausesByDate {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: PausesByDate = {};
  for (const [day, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const records = list.flatMap((p): PauseRecord[] => {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return [];
      const r = p as Record<string, unknown>;
      if (!isTime(r.at)) return [];
      // Formato de hoje: segundos. Doc anterior a 2026-09-13: minutos — `mins * 60`
      // reproduz o plano de antes exatamente, porque o gerador soma e arredonda depois.
      if (typeof r.secs === 'number' && Number.isInteger(r.secs) && r.secs >= 1) return [{ at: r.at, secs: r.secs }];
      if (typeof r.mins === 'number' && Number.isInteger(r.mins) && r.mins >= 1) return [{ at: r.at, secs: r.mins * 60 }];
      return [];
    });
    if (records.length > 0) out[day] = sortPauses(records);
  }
  return out;
}

/**
 * Quantas pausas e quantos minutos num dia — o resumo do fim do dia mostra. Os minutos
 * saem da soma dos segundos, arredondada uma vez (a mesma conta do gerador), senão o
 * resumo contaria minutos que o plano não andou.
 */
export function pausesTotal(day: PauseRecord[] | undefined): { count: number; mins: number } {
  const list = day ?? [];
  return { count: list.length, mins: pausedMinutes(list.reduce((s, p) => s + p.secs, 0)) };
}

/** Segundos pausados → os minutos que o plano anda. Uma conta só, sobre o total. */
export const pausedMinutes = (secs: number): number => Math.ceil(Math.max(0, secs) / 60);

// ---------------------------------------------------------------- a pausa aberta

/**
 * A pausa em andamento, como fica no dispositivo (`localStorage`, por uid): o dia,
 * o bloco como era, e quando pausou. Ao abrir o app, o timer volta pausado, e o
 * usuário retoma ou para. De outro dia, é esquecida — o dia acabou sem retomar.
 */
export interface PauseSession {
  dateKey: DateKey;
  block: StudyBlock;
  /** ms de quando pausou. */
  pausedAt: number;
}

export function pauseSessionFor(block: StudyBlock, dateKey: DateKey, pausedAt: number): PauseSession {
  const b: StudyBlock = { time: block.time, endTime: block.endTime, name: block.name, type: block.type, xp: block.xp || 0, cycle: block.cycle };
  if (block.paused) b.paused = block.paused;
  return { dateKey, block: b, pausedAt };
}

/** A pausa guardada no dispositivo, validada. `null` se não tem ou está corrompida. */
export function parsePauseSession(raw: unknown): PauseSession | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.dateKey)) return null;
  if (typeof r.pausedAt !== 'number' || !Number.isFinite(r.pausedAt)) return null;
  const b = r.block;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const blk = b as Record<string, unknown>;
  if (!isTime(blk.time) || !isTime(blk.endTime)) return null;
  if (blk.type !== 'estudo' && blk.type !== 'pausa') return null;
  const block: StudyBlock = {
    time: blk.time,
    endTime: blk.endTime,
    name: typeof blk.name === 'string' ? blk.name : '',
    type: blk.type,
    xp: typeof blk.xp === 'number' && Number.isFinite(blk.xp) ? blk.xp : 0,
    cycle: typeof blk.cycle === 'number' ? blk.cycle : undefined,
  };
  if (typeof blk.paused === 'number' && blk.paused > 0) block.paused = blk.paused;
  return { dateKey: r.dateKey, block, pausedAt: r.pausedAt };
}

// ---------------------------------------------------------------- antes ↔ depois

/** O estudo/pausa do plano que contém o minuto `at`, ou null (evento, vão, fora do dia). */
export function blockAt(blocks: StudyBlock[], at: TimeString): StudyBlock | null {
  const m = timeToMins(at);
  return blocks.find((b) => isPomodoroPart(b) && timeToMins(b.time) <= m && m < timeToMins(b.endTime)) ?? null;
}

/** A cadeia contígua de estudos/pausas a partir de `idx` — o que o cursor do gerador arrasta junto. */
function chainFrom(blocks: StudyBlock[], idx: number): StudyBlock[] {
  const out = [blocks[idx]!];
  for (let i = idx + 1; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (!isPomodoroPart(b) || b.time !== out[out.length - 1]!.endTime) break;
    out.push(b);
  }
  return out;
}

export interface PausePair {
  before: StudyBlock;
  /** O mesmo bloco no plano de depois; null se ele sumiu (cortado no fim da janela, ou a pausa que não coube). */
  after: StudyBlock | null;
}

/**
 * Quem é quem entre o plano de antes e o de depois de registrar uma pausa em `at`:
 * o bloco pausado e a cadeia contígua de estudos/pausas depois dele, um a um pela
 * posição (o gerador é determinístico: o que vem depois de um evento ou de um vão
 * não se move, e não entra aqui). Tipo diferente na mesma posição = o bloco sumiu.
 * `null` se `at` não cai em bloco nenhum.
 */
export function pauseRemap(before: StudyBlock[], after: StudyBlock[], at: TimeString): PausePair[] | null {
  const m = timeToMins(at);
  const iB = before.findIndex((b) => isPomodoroPart(b) && timeToMins(b.time) <= m && m < timeToMins(b.endTime));
  if (iB < 0) return null;
  const paused = before[iB]!;
  const iA = after.findIndex((b) => isPomodoroPart(b) && b.time === paused.time);
  const chainB = chainFrom(before, iB);
  const chainA = iA >= 0 ? chainFrom(after, iA) : [];
  return chainB.map((b, k) => {
    const a = chainA[k];
    return { before: b, after: a && a.type === b.type ? a : null };
  });
}

/**
 * Os checks do dia acompanhando os blocos que deslizaram: a chave é o horário do
 * bloco, então um check feito adiantado num bloco posterior mudaria de bloco (ou
 * ficaria órfão) sem isto. Check de bloco que sumiu é descartado — e contado, pro toast.
 */
export function remapChecksForPause(
  day: Record<TimeString, CheckRecord> | undefined,
  pairs: PausePair[],
): { checks: Record<TimeString, CheckRecord>; dropped: number } {
  const out: Record<TimeString, CheckRecord> = {};
  const inChain = new Set(pairs.map((p) => p.before.time));
  for (const [key, rec] of Object.entries(day ?? {})) if (!inChain.has(key)) out[key] = rec;
  let dropped = 0;
  for (const { before, after } of pairs) {
    const rec = day?.[before.time];
    if (!rec) continue;
    if (after) out[after.time] = rec;
    else dropped++;
  }
  return { checks: out, dropped };
}

/**
 * Os grupos do dia acompanhando os blocos: começo e fim são horários de bloco, então
 * seguem o bloco correspondente. Grupo que termina num bloco que sumiu termina no
 * último da cadeia que ficou. O que está depois de um evento não se move, como no plano.
 */
export function remapGroupsForPause(groups: StudyGroup[], pairs: PausePair[]): StudyGroup[] {
  const starts = new Map<TimeString, TimeString>();
  const ends = new Map<TimeString, TimeString>();
  let lastKept: StudyBlock | null = null;
  for (const { before, after } of pairs) {
    if (after) lastKept = after;
    starts.set(before.time, after ? after.time : before.time);
    ends.set(before.endTime, after ? after.endTime : lastKept ? lastKept.endTime : before.endTime);
  }
  // O bloco pausado não muda de início — só de fim.
  if (pairs[0]) starts.set(pairs[0].before.time, pairs[0].before.time);
  return groups
    .map((g) => ({ ...g, start: starts.get(g.start) ?? g.start, end: ends.get(g.end) ?? g.end }))
    .sort((a, b) => timeToMins(a.start) - timeToMins(b.start));
}

// ---------------------------------------------------------------- o que a pausa faz com o plano

/** O que impediu o bloco pausado de crescer: o compromisso colado nele, ou o fim da janela. */
export type PauseWall = { kind: 'event'; name: string; at: TimeString } | { kind: 'window'; at: TimeString };

export interface PauseSqueeze {
  /** O estudo, como aparece na lista ("Estudo 8"). */
  name: string;
  /** Os minutos que valem depois; 0 = saiu do plano. */
  mins: number;
}

/**
 * O que uma pausa fez (ou faria) com o plano, lido dos dois planos — nunca de uma conta
 * paralela ao gerador. Serve o toast de retomar e a linha que o foco mostra enquanto o
 * relógio está congelado.
 */
export interface PauseOutlook {
  /** O bloco pausado, como aparece na lista ("Estudo 3"). */
  block: string;
  /** Quanto o bloco pausado cresceu no plano — o quanto o dia anda. */
  grew: number;
  /** Quanto o bloco pausado perdeu de duração que vale: não tinha pra onde crescer. */
  lost: number;
  /** A duração que vale do bloco pausado depois (0 = sumiu). */
  minsAfter: number;
  /** O que cortou o bloco pausado, quando `lost > 0`. */
  wall: PauseWall | null;
  /** Estudos DEPOIS do pausado, na cadeia, que encolheram ou sumiram pra abrir espaço. */
  squeezed: PauseSqueeze[];
}

const isBlockage = (b: Pick<StudyBlock, 'type'>): boolean => b.type === 'event' || b.type === 'intervalo';

/** O compromisso que começa exatamente em `at`, ou o fim da janela. Eventos não se movem, então `after` serve. */
function wallAt(after: StudyBlock[], at: TimeString): PauseWall {
  const ev = after.find((b) => isBlockage(b) && b.time === at);
  return ev ? { kind: 'event', name: eventDisplayName(ev.name), at } : { kind: 'window', at };
}

/**
 * Quanto o dia andou e quem pagou por isso. O caso comum é o dia andar: o bloco pausado
 * cresce, a cadeia depois dele desliza, e o último estudo antes da parede (o fim da janela,
 * a refeição) encolhe — `grew` e `squeezed`. Mas um bloco COLADO num compromisso (o estudo
 * das 10:00 com a aula às 10:25) não tem pra onde crescer: cada minuto pausado sai dele.
 * Aí `lost` conta, e `wall` diz quem não esperou. Até 2026-09-17 esse caso era contado
 * como "o dia anda 6 min" — o dia não andava nada; o estudo é que encolhia, calado.
 *
 * Os nomes já saem prontos pra tela ("Estudo 3", "👥 Reunião"): o 📖 do gerador e o 📅 do
 * evento sem ícone próprio saem, o ícone que a pessoa escreveu no nome fica.
 */
export function pauseOutlook(before: StudyBlock[], after: StudyBlock[], block: Pick<StudyBlock, 'time'>): PauseOutlook {
  const pairs = pauseRemap(before, after, block.time);
  const head = pairs?.[0];
  if (!head) return { block: '', grew: 0, lost: 0, minsAfter: 0, wall: null, squeezed: [] };
  const b0 = head.before;
  const a0 = head.after;
  const minsAfter = a0 ? blockMins(a0) : 0;
  const lost = Math.max(0, blockMins(b0) - minsAfter);
  const grew = a0 ? Math.max(0, timeToMins(a0.endTime) - timeToMins(b0.endTime)) : 0;
  // Onde o corte caiu: o fim do bloco regenerado — ou, se ele sumiu inteiro, o fim da
  // cadeia que sumiu com ele (o gerador seguiu daí: ou emitiu o compromisso, ou a janela acabou).
  const cutAt = a0 ? a0.endTime : pairs[pairs.length - 1]!.before.endTime;
  const squeezed: PauseSqueeze[] = [];
  for (const { before: b, after: a } of pairs.slice(1)) {
    if (b.type !== 'estudo') continue;
    if (!a) squeezed.push({ name: cleanBlockName(b.name), mins: 0 });
    else if (blockMins(a) < blockMins(b)) squeezed.push({ name: cleanBlockName(b.name), mins: blockMins(a) });
  }
  return { block: cleanBlockName(b0.name), grew, lost, minsAfter, wall: lost > 0 ? wallAt(after, cutAt) : null, squeezed };
}
