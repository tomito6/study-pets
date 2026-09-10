// "Clicar fora fecha, Esc fecha" — o que todo popover ancorado precisa e nenhum
// deveria reescrever. Era privado do menu do avatar (app/Header.tsx); o sininho
// pediu o mesmo, então virou hook.
//
// Devolve o ref que envolve o gatilho E o painel: um clique dentro desse ref não
// fecha (senão o próprio botão que abre fecharia no mesmo gesto).

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export function useDismiss<T extends HTMLElement>(open: boolean, onClose: () => void): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return ref;
}
