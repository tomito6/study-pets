// "Tela grande" = janela a partir de 1100px: é onde entra o layout de laptop (trilho à esquerda, coluna
// da direita, modo Semana). A largura é a mesma da media query em app.css — os dois andam juntos.
// Largura decide, não o aparelho: tablet deitado e janela estreita caem do lado do celular.

import { useSyncExternalStore } from 'react';

export const WIDE_MIN_PX = 1100;

const query =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(`(min-width: ${WIDE_MIN_PX}px)`)
    : null;

function subscribe(listener: () => void): () => void {
  if (!query) return () => {};
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

const isWide = (): boolean => query?.matches ?? false;

/** True enquanto a janela tem 1100px ou mais; re-renderiza quando cruza a largura. */
export function useWide(): boolean {
  return useSyncExternalStore(subscribe, isWide, () => false);
}
