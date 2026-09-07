// Aparência: a escolha do tema. Aplica na hora e já salva — como equipar um pet, é grátis e
// instantâneo. Não passa pelo rascunho do "Salvar" das Configurações de propósito: o valor
// da coisa é ver na hora. O doc é a fonte da verdade; o <html> só reflete o estado.

import { isThemeId, normalizeTheme } from '../domain/theme';
import type { ThemeId } from '../domain/theme';
import { applyThemeToDocument } from '../infrastructure/theme';
import { notify, state } from '../store/store';
import { scheduleSave } from './save';

export type SetThemeResult = { ok: true } | { ok: false; reason: 'unknown-theme' };

export function setTheme(id: string): SetThemeResult {
  if (!isThemeId(id)) return { ok: false, reason: 'unknown-theme' };
  if (state.config.theme !== id) {
    state.config.theme = id;
    scheduleSave();
    notify();
  }
  applyThemeToDocument(id);
  return { ok: true };
}

export const currentTheme = (): ThemeId => normalizeTheme(state.config?.theme);

/**
 * O tema que o estado diz → o <html>. Chamado depois de carregar o documento e a cada
 * documento que chega do servidor (é assim que a escolha acompanha entre dispositivos).
 */
export function syncThemeFromState(): void {
  applyThemeToDocument(currentTheme());
}
