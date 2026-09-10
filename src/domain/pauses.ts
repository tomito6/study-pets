// Pausar o bloco em andamento — as regras puras. O timer congela (ver `timerProgress`
// com `pausedAt`); ao retomar, a pausa vira um `PauseRecord` do dia, e o gerador
// estica o bloco que a contém, empurrando o resto do dia (ver `generateBlocks`).
//
// Aqui: o registro (quanto durou, arredondado a favor de quem pausou), a leitura do
// doc, a pausa aberta que fica no dispositivo (o timer não sobrevive a reload — a
// pausa sobrevive, senão pausar e dar F5 seria punir a pausa), e a correspondência
// entre o plano de antes e o de depois — o que os checks e os grupos chaveados por
// horário precisam pra acompanhar os blocos que deslizaram.

import { minsToTime, timeToMins } from './time';
import type { CheckRecord, DateKey, PauseRecord, PausesByDate, StudyBlock, StudyGroup, TimeString } from './types';

const isTime = (v: unknown): v is TimeString => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
const isPomodoroPart = (b: Pick<StudyBlock, 'type'>): boolean => b.type === 'estudo' || b.type === 'pausa';

/**
 * O registro de uma pausa que acabou: o minuto em que começou (pra baixo) e quanto
 * durou (pra cima, mínimo 1). Arredondar assim garante que ninguém perde segundos
 * por ter pausado — ganha até 59.
 */
export function pauseRecordFor(pausedAt: Date, resumedAt: Date): PauseRecord {
  const at = minsToTime(pausedAt.getHours() * 60 + pausedAt.getMinutes());
  const mins = Math.max(1, Math.ceil((resumedAt.getTime() - pausedAt.getTime()) / 60000));
  return { at, mins };
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
      if (!isTime(r.at) || typeof r.mins !== 'number' || !Number.isInteger(r.mins) || r.mins < 1) return [];
      return [{ at: r.at, mins: r.mins }];
    });
    if (records.length > 0) out[day] = sortPauses(records);
  }
  return out;
}

/** Quantas pausas e quantos minutos num dia — o resumo do fim do dia mostra. */
export function pausesTotal(day: PauseRecord[] | undefined): { count: number; mins: number } {
  const list = day ?? [];
  return { count: list.length, mins: list.reduce((s, p) => s + p.mins, 0) };
}

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
  const b: StudyBlock = { time: block.time, endTime: block.endTime, name: block.name, type: block.type, xp: block.xp || 0, session: block.session };
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
    session: typeof blk.session === 'number' ? blk.session : undefined,
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
