// Casos de uso da nota no bloco. Como o grupo, a nota não mexe no plano — nada de
// clearBlockCache: salva, notifica e pronto. Dia encerrado é somente leitura; dia
// futuro pode, porque escrever "lavar roupa" na pausa de amanhã é planejar o amanhã.

import { isDayClosed } from '../domain/checks';
import { normalizeNoteText, noteOf, withNote } from '../domain/notes';
import type { DateKey, StudyBlock } from '../domain/types';
import { notify, state } from '../store/store';
import { scheduleSave } from './save';

export type NoteRefusal = 'closed';
export type NoteResult = { ok: true; note: string | null } | { ok: false; reason: NoteRefusal };

export const canEditNotes = (dateKey: DateKey): boolean => !isDayClosed(state.closedDays, dateKey);

/** A nota deste bloco, ou null. A chave é o horário, como no check. */
export const blockNote = (dateKey: DateKey, block: Pick<StudyBlock, 'time'>): string | null => noteOf(state.notes, dateKey, block.time);

/** Grava (ou, com texto vazio, apaga) a nota do bloco. Texto igual ao que já está não salva nada. */
export function setBlockNote(dateKey: DateKey, block: Pick<StudyBlock, 'time'>, text: string): NoteResult {
  if (!canEditNotes(dateKey)) return { ok: false, reason: 'closed' };
  const limpo = normalizeNoteText(text);
  const note = limpo || null;
  if ((blockNote(dateKey, block) ?? '') === limpo) return { ok: true, note };
  state.notes = withNote(state.notes, dateKey, block.time, limpo);
  scheduleSave();
  notify();
  return { ok: true, note };
}

export const clearBlockNote = (dateKey: DateKey, block: Pick<StudyBlock, 'time'>): NoteResult => setBlockNote(dateKey, block, '');
