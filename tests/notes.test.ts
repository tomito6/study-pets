// A nota no bloco (src/domain/notes.ts): uma frase presa a um bloco só, por horário,
// que segue o bloco quando uma pausa do timer desliza o dia.

import { describe, expect, it } from 'vitest';
import { MAX_NOTE_LENGTH, normalizeNoteText, normalizeNotes, noteOf, remapNotesForPause, withNote } from '../src/domain/notes';
import { pauseRemap } from '../src/domain/pauses';
import { generateBlocks } from '../src/domain/planner';
import type { PlannerConfig, StudyEvent } from '../src/domain/types';

const HOJE = '2026-09-02';

describe('normalizeNoteText', () => {
  it('apara pontas, junta espaços e corta no teto', () => {
    expect(normalizeNoteText('  lavar   roupa \n')).toBe('lavar roupa');
    expect(normalizeNoteText('   ')).toBe('');
    expect(normalizeNoteText('a'.repeat(MAX_NOTE_LENGTH + 20))).toHaveLength(MAX_NOTE_LENGTH);
    expect(normalizeNoteText('x'.repeat(MAX_NOTE_LENGTH - 1) + '  fim')).toHaveLength(MAX_NOTE_LENGTH - 1); // o corte não deixa espaço pendurado
  });
});

describe('withNote / noteOf', () => {
  it('grava, troca e apaga; dia sem nota sai do mapa', () => {
    const a = withNote({}, HOJE, '10:55', ' lavar roupa ');
    expect(a).toEqual({ [HOJE]: { '10:55': 'lavar roupa' } });
    expect(noteOf(a, HOJE, '10:55')).toBe('lavar roupa');
    expect(noteOf(a, HOJE, '09:00')).toBeNull();
    expect(noteOf(undefined, HOJE, '10:55')).toBeNull();

    const b = withNote(a, HOJE, '10:55', 'estender roupa');
    expect(b[HOJE]).toEqual({ '10:55': 'estender roupa' });

    const c = withNote(b, HOJE, '10:55', '');
    expect(c).toEqual({});
  });

  it('devolve um mapa novo e não mexe no de entrada', () => {
    const antes = { [HOJE]: { '09:00': 'lista 3' } };
    const depois = withNote(antes, HOJE, '10:55', 'lavar roupa');
    expect(antes).toEqual({ [HOJE]: { '09:00': 'lista 3' } });
    expect(depois).toEqual({ [HOJE]: { '09:00': 'lista 3', '10:55': 'lavar roupa' } });
    expect(depois).not.toBe(antes);
  });
});

describe('normalizeNotes — leitura do documento', () => {
  it('lixo vira vazio; dia ou horário inválido cai; texto vazio cai; o que sobra vem normalizado', () => {
    expect(normalizeNotes(undefined)).toEqual({});
    expect(normalizeNotes('x')).toEqual({});
    expect(normalizeNotes([])).toEqual({});
    expect(
      normalizeNotes({
        [HOJE]: { '10:55': '  lavar   roupa ', '9:00': 'sem zero', '09:00': '   ', '11:15': 42 },
        ontem: { '10:00': 'x' },
        '2026-09-03': 'x',
        '2026-09-04': {},
      }),
    ).toEqual({ [HOJE]: { '10:55': 'lavar roupa' } });
  });
});

describe('remapNotesForPause — a nota segue o bloco', () => {
  const cfg: PlannerConfig = { studyWindows: [{ start: '09:00', end: '17:30' }], start: '09:00', end: '17:30', pomo: 25, shortBreak: 5, longBreak: 15 };
  const almoco: StudyEvent = { name: '🍽️ Almoço', start: '13:00', end: '14:00', countsAsStudy: false };
  const before = generateBlocks(cfg, [almoco]);
  const after = generateBlocks(cfg, [almoco], [{ at: '10:10', secs: 420 }]);
  const pairs = pauseRemap(before, after, '10:10')!;

  it('anteriores ficam; no bloco pausado fica (o início não muda); posteriores seguem o bloco; fora da cadeia fica', () => {
    // Antes: E3 10:00–10:25, pausa 10:25–10:30, E4 10:30–10:55, pausa longa 10:55–11:10. Com 7 min: tudo +7.
    const day = { '09:00': 'lista 3', '10:00': 'capítulo 4', '10:55': 'lavar roupa', '14:00': 'tarde' };
    const r = remapNotesForPause(day, pairs);
    expect(r.dropped).toBe(0);
    expect(r.notes).toEqual({ '09:00': 'lista 3', '10:00': 'capítulo 4', '11:02': 'lavar roupa', '14:00': 'tarde' });
  });

  it('nota de bloco que sumiu é descartada e contada', () => {
    const afterBig = generateBlocks(cfg, [almoco], [{ at: '10:10', secs: 1200 }]);
    const p = pauseRemap(before, afterBig, '10:10')!;
    const sumiu = p.find((x) => x.after === null)!.before;
    const r = remapNotesForPause({ [sumiu.time]: 'some' }, p);
    expect(r.dropped).toBe(1);
    expect(r.notes).toEqual({});
  });

  it('sem nota nenhuma, nada a fazer', () => {
    expect(remapNotesForPause(undefined, pairs)).toEqual({ notes: {}, dropped: 0 });
  });
});
