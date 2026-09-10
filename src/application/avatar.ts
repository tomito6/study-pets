// Caso de uso da aparência do personagem: ler os sprites e trocar o visual.
//
// A UI não fala com o canvas nem muta o estado — pede aqui.

import { normalizeAvatar } from '../domain/avatar';
import type { AvatarConfig } from '../domain/avatar';
import { avatarSprites } from '../infrastructure/avatar/sprite';
import { notify, state } from '../store/store';
import { scheduleSave } from './save';

/** Os 4 frames de uma aparência qualquer — o onboarding mostra a escolha antes de aplicá-la. */
export const avatarSpritesOf = (cfg: AvatarConfig): string[] => avatarSprites(cfg);

/** Os 4 frames do personagem como ele está agora. Memoizado por aparência. */
export const currentAvatarSprites = (): string[] => avatarSpritesOf(state.avatar);

/**
 * Muda o que o usuário escolheu (tom de pele, cor, penteado ou corpo) e salva.
 * Devolve `false` quando nada mudaria — evita save à toa ao reclicar o mesmo.
 */
export function setAvatar(patch: Partial<AvatarConfig>): boolean {
  const next = normalizeAvatar({ ...state.avatar, ...patch });
  const atual = state.avatar;
  if (next.skin === atual.skin && next.hair === atual.hair && next.style === atual.style && next.body === atual.body) return false;
  state.avatar = next;
  scheduleSave();
  notify();
  return true;
}
