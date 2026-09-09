// Caso de uso da aparência do personagem: ler os sprites e trocar o visual.
//
// A UI não fala com o canvas nem muta o estado — pede aqui.

import { normalizeAvatar } from '../domain/avatar';
import type { AvatarConfig } from '../domain/avatar';
import { avatarSprites } from '../infrastructure/avatar/sprite';
import { notify, state } from '../store/store';
import { scheduleSave } from './save';

/** Os 4 frames do personagem como ele está agora. Memoizado por aparência. */
export const currentAvatarSprites = (): string[] => avatarSprites(state.avatar);

/**
 * Muda o que o usuário escolheu (tom de pele, cor ou penteado) e salva.
 * Devolve `false` quando nada mudaria — evita save à toa ao reclicar o mesmo.
 */
export function setAvatar(patch: Partial<AvatarConfig>): boolean {
  const next = normalizeAvatar({ ...state.avatar, ...patch });
  if (next.skin === state.avatar.skin && next.hair === state.avatar.hair && next.style === state.avatar.style) return false;
  state.avatar = next;
  scheduleSave();
  notify();
  return true;
}
