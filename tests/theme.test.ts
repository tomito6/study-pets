import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEME_IDS, isThemeId, normalizeTheme } from '../src/domain/theme';

describe('aparência — catálogo de temas', () => {
  it('os quatro temas, com o escuro como padrão', () => {
    expect([...THEME_IDS]).toEqual(['dark', 'lamp', 'paper', 'oat']);
    expect(DEFAULT_THEME).toBe('dark');
  });

  it('reconhece só os ids do catálogo', () => {
    expect(isThemeId('paper')).toBe(true);
    expect(isThemeId('Paper')).toBe(false);
    expect(isThemeId('arcade')).toBe(false); // o tema pixel foi descartado
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId(1)).toBe(false);
  });

  it('normaliza qualquer coisa pra um id válido: ausente ou desconhecido vira escuro', () => {
    expect(normalizeTheme('oat')).toBe('oat');
    expect(normalizeTheme(undefined)).toBe('dark');
    expect(normalizeTheme('')).toBe('dark');
    expect(normalizeTheme('neon')).toBe('dark');
    expect(normalizeTheme({ id: 'lamp' })).toBe('dark');
  });
});
