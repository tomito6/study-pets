import { describe, expect, it } from 'vitest';
import { DEFAULT_CFG, migrateConfig } from '../src/domain/config';

describe('migrateConfig — configs antigas continuam carregando', () => {
  it('cria studyWindows a partir de start/end quando não existe', () => {
    const antiga = { start: '08:00', end: '17:00' };
    expect(migrateConfig(antiga).studyWindows).toEqual([{ start: '08:00', end: '17:00' }]);
  });

  it('usa os defaults quando nem start/end existem', () => {
    expect(migrateConfig({}).studyWindows).toEqual([{ start: '09:00', end: '18:00' }]);
  });

  it('preserva studyWindows já existente', () => {
    const nova = {
      start: '09:00',
      end: '20:00',
      studyWindows: [
        { start: '09:00', end: '12:00' },
        { start: '15:00', end: '20:00' },
      ],
    };
    expect(migrateConfig(nova).studyWindows).toHaveLength(2);
  });

  it('substitui studyWindows vazio pelo fallback', () => {
    const vazia = { start: '10:00', end: '16:00', studyWindows: [] };
    expect(migrateConfig(vazia).studyWindows).toEqual([{ start: '10:00', end: '16:00' }]);
  });

  it('remove extraBreaks, que foi descontinuado', () => {
    const comExtra = { start: '09:00', end: '18:00', extraBreaks: [{ start: '11:00', end: '11:30' }] };
    expect('extraBreaks' in migrateConfig(comExtra)).toBe(false);
  });

  it('é idempotente', () => {
    const uma = migrateConfig({ start: '08:00', end: '17:00' });
    expect(migrateConfig(uma)).toEqual(uma);
  });

  it('não modifica o objeto recebido', () => {
    const original = { start: '08:00', end: '17:00' };
    migrateConfig(original);
    expect('studyWindows' in original).toBe(false);
  });

  it('preserva os outros campos', () => {
    const antiga = { start: '08:00', end: '17:00', pomo: 50, dailyStudyMin: 120 };
    const migrada = migrateConfig(antiga);
    expect(migrada.pomo).toBe(50);
    expect(migrada.dailyStudyMin).toBe(120);
  });
});

describe('DEFAULT_CFG', () => {
  it('já vem no formato novo, com studyWindows', () => {
    expect(DEFAULT_CFG.studyWindows).toEqual([{ start: '09:00', end: '18:00' }]);
  });

  it('mantém a meta diária padrão de 60 minutos', () => {
    expect(DEFAULT_CFG.dailyStudyMin).toBe(60);
  });
});
