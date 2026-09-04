// "Baixar meus dados" (src/application/export.ts): o arquivo é o documento salvo mais
// a data de exportação, sem nada que identifique a conta. Em Node não há download.

import { beforeEach, describe, expect, it } from 'vitest';
import { buildExport, exportFilename, exportMyData } from '../src/application/export';
import { SCHEMA_VERSION, emptyPersistedState, hydrateUserDoc } from '../src/domain/persistence';
import { downloadText } from '../src/infrastructure/download';
import { state } from '../src/store/store';

const AGORA = new Date('2026-09-02T17:30:00');

beforeEach(() => {
  Object.assign(state, emptyPersistedState(), {
    user: { uid: 'uid-secreto', displayName: 'Tomi', email: 'tomi@example.com' },
    checks: { '2026-09-01': { '09:00': { pet: 'cat', bonus: 0 } } },
    coinsSpent: 150,
  });
});

describe('buildExport', () => {
  it('é o documento salvo, com exportedAt, e carrega de volta igual', () => {
    const doc = buildExport(AGORA);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(doc.exportedAt).toBe(AGORA.toISOString());
    expect(doc.checks).toEqual({ '2026-09-01': { '09:00': { pet: 'cat', bonus: 0 } } });
    expect(doc.coinsSpent).toBe(150);
    expect(hydrateUserDoc(doc)).toEqual({ ...emptyPersistedState(), checks: doc.checks, coinsSpent: 150 });
  });

  it('não leva uid, e-mail nem nome — nem o carimbo de sync', () => {
    const texto = JSON.stringify(buildExport(AGORA));
    expect(texto).not.toContain('uid-secreto');
    expect(texto).not.toContain('tomi@example.com');
    expect(texto).not.toContain('Tomi');
    expect(buildExport(AGORA)).not.toHaveProperty('meta');
  });

  it('o nome do arquivo tem a data local do dia', () => {
    expect(exportFilename(AGORA)).toBe('study-pets-2026-09-02.json');
  });
});

describe('download em Node', () => {
  it('sem DOM, não baixa e diz isso', () => {
    expect(downloadText('x.json', '{}')).toBe(false);
    expect(exportMyData(AGORA)).toBe(false);
  });
});
