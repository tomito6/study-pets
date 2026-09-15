// A nota no bloco pelo caso de uso (src/application/notes.ts): grava, troca, apaga, recusa
// dia encerrado, vai pro documento e volta, e é zerada com o histórico.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blockNote, canEditNotes, clearBlockNote, setBlockNote } from '../src/application/notes';
import { blocksForDay, clearBlockCache, rebuildWeeks } from '../src/application/plan';
import { cancelSession } from '../src/application/settings';
import { emptyPersistedState, hydrateUserDoc, serializeState } from '../src/domain/persistence';
import { derived, state } from '../src/store/store';

const AGORA = new Date('2026-09-02T10:30:00'); // quarta
const HOJE = '2026-09-02';
const AMANHA = '2026-09-03';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.weeks = [];
  clearBlockCache();
  rebuildWeeks(AGORA);
});

const pausaLonga = () => blocksForDay(HOJE).find((b) => b.type === 'pausa' && b.name.includes('longa'))!;

describe('setBlockNote / clearBlockNote', () => {
  it('grava a frase normalizada no horário do bloco, e a lê de volta', () => {
    const b = pausaLonga();
    expect(setBlockNote(HOJE, b, '  lavar   roupa ')).toEqual({ ok: true, note: 'lavar roupa' });
    expect(blockNote(HOJE, b)).toBe('lavar roupa');
    expect(state.notes).toEqual({ [HOJE]: { [b.time]: 'lavar roupa' } });
  });

  it('texto vazio apaga, e Apagar também; o dia some do mapa', () => {
    const b = pausaLonga();
    setBlockNote(HOJE, b, 'lavar roupa');
    expect(setBlockNote(HOJE, b, '   ')).toEqual({ ok: true, note: null });
    expect(state.notes).toEqual({});
    setBlockNote(HOJE, b, 'lavar roupa');
    expect(clearBlockNote(HOJE, b)).toEqual({ ok: true, note: null });
    expect(blockNote(HOJE, b)).toBeNull();
  });

  it('o mesmo texto de novo não mexe no estado (nem salva)', () => {
    const b = pausaLonga();
    setBlockNote(HOJE, b, 'lavar roupa');
    const antes = state.notes;
    expect(setBlockNote(HOJE, b, ' lavar roupa ')).toEqual({ ok: true, note: 'lavar roupa' });
    expect(state.notes).toBe(antes);
  });

  it('dia encerrado é somente leitura; dia futuro pode', () => {
    const b = pausaLonga();
    state.closedDays[HOJE] = true;
    expect(canEditNotes(HOJE)).toBe(false);
    expect(setBlockNote(HOJE, b, 'x')).toEqual({ ok: false, reason: 'closed' });
    expect(state.notes).toEqual({});
    expect(setBlockNote(AMANHA, b, 'lavar roupa')).toEqual({ ok: true, note: 'lavar roupa' });
    expect(blockNote(AMANHA, b)).toBe('lavar roupa');
  });

  it('a nota é por horário: o estudo das 09:00 e a pausa das 10:55 têm cada um a sua', () => {
    const estudo = blocksForDay(HOJE)[0]!;
    setBlockNote(HOJE, estudo, 'lista 3');
    setBlockNote(HOJE, pausaLonga(), 'lavar roupa');
    expect(blockNote(HOJE, estudo)).toBe('lista 3');
    expect(blockNote(HOJE, pausaLonga())).toBe('lavar roupa');
  });
});

describe('persistência', () => {
  it('vai pro documento e volta; doc de antes das notas abre sem nenhuma', () => {
    setBlockNote(HOJE, pausaLonga(), 'lavar roupa');
    expect(hydrateUserDoc(serializeState(state)).notes).toEqual(state.notes);
    expect(hydrateUserDoc({ schemaVersion: 5, checks: {} }).notes).toEqual({});
  });

  it('apagar o histórico zera as notas', () => {
    setBlockNote(HOJE, pausaLonga(), 'lavar roupa');
    cancelSession(AGORA);
    expect(state.notes).toEqual({});
  });
});
