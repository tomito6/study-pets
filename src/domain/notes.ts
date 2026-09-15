// A nota no bloco: uma frase sua presa a UM bloco do dia — "lavar roupa" na pausa
// longa, "lista 3" no Estudo 3. Puro.
//
// Nasceu de um buraco (2026-09-15): o plano é gerado, e bloco gerado não carrega intenção
// nenhuma de quem estuda. Só havia dois jeitos de botar palavras suas no dia — o evento,
// que reserva tempo e remonta o plano em volta, e o grupo, que exige um trecho com estudo
// dentro e desenha uma caixa. Não existia um jeito leve de dizer o que você vai fazer num
// bloco só, sem mexer na estrutura do dia. A pausa é o caso mais gritante: estudo você
// sabe o que é; pausa você preenche com alguma coisa.
//
// É anotação por horário, como os checks e os grupos: a chave é o `time` do bloco, então
// config mudando não corrompe nada, e uma pausa do timer que desliza o dia leva a nota
// junto (`remapNotesForPause`, o mesmo remapeamento do check). Nunca entra no gerador —
// o plano fica igual, a linha ganha a frase.

import type { PausePair } from './pauses';
import type { DateKey, TimeString } from './types';

/** Uma frase curta: cabe na linha do bloco ao lado do nome, no celular. */
export const MAX_NOTE_LENGTH = 60;

/** As notas de um dia, por horário do bloco. */
export type DayNotes = Record<TimeString, string>;
export type NotesByDate = Record<DateKey, DayNotes>;

/** Espaço repetido vira um, pontas aparadas, teto de `MAX_NOTE_LENGTH`. Vazio = sem nota. */
export const normalizeNoteText = (text: string): string =>
  text.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_LENGTH).trim();

export const noteOf = (notes: NotesByDate | undefined, dateKey: DateKey, time: TimeString): string | null =>
  notes?.[dateKey]?.[time] || null;

/**
 * As notas com a de `time` trocada por `text` (vazio apaga). Devolve um mapa novo — o
 * estado é mutado no lugar por quem chama, e um dia sem nota nenhuma sai do mapa, pra
 * não deixar `{}` órfão no documento.
 */
export function withNote(notes: NotesByDate, dateKey: DateKey, time: TimeString, text: string): NotesByDate {
  const limpo = normalizeNoteText(text);
  const dia: DayNotes = { ...(notes[dateKey] ?? {}) };
  if (limpo) dia[time] = limpo;
  else delete dia[time];
  const out: NotesByDate = { ...notes };
  if (Object.keys(dia).length > 0) out[dateKey] = dia;
  else delete out[dateKey];
  return out;
}

const isDay = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: string): boolean => /^\d{2}:\d{2}$/.test(v);

/** Campo cru do documento → só dias e horários válidos, com texto não vazio (já normalizado). */
export function normalizeNotes(raw: unknown): NotesByDate {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: NotesByDate = {};
  for (const [day, dia] of Object.entries(raw as Record<string, unknown>)) {
    if (!isDay(day) || !dia || typeof dia !== 'object' || Array.isArray(dia)) continue;
    const notas: DayNotes = {};
    for (const [time, text] of Object.entries(dia as Record<string, unknown>)) {
      if (!isTime(time) || typeof text !== 'string') continue;
      const limpo = normalizeNoteText(text);
      if (limpo) notas[time] = limpo;
    }
    if (Object.keys(notas).length > 0) out[day] = notas;
  }
  return out;
}

/**
 * Depois de uma pausa do timer o dia é regenerado e os blocos deslizam: a nota segue o
 * bloco dela, um a um pela posição na cadeia (a mesma correspondência dos checks — ver
 * `pauseRemap`). Nota de bloco que sumiu é descartada e contada, como o check.
 */
export function remapNotesForPause(day: DayNotes | undefined, pairs: PausePair[]): { notes: DayNotes; dropped: number } {
  const out: DayNotes = {};
  const inChain = new Set(pairs.map((p) => p.before.time));
  for (const [key, text] of Object.entries(day ?? {})) if (!inChain.has(key)) out[key] = text;
  let dropped = 0;
  for (const { before, after } of pairs) {
    const text = day?.[before.time];
    if (!text) continue;
    if (after) out[after.time] = text;
    else dropped++;
  }
  return { notes: out, dropped };
}
