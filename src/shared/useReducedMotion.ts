// `prefers-reduced-motion`, ao vivo: quem pediu menos movimento ao sistema não recebe
// sprite animado nem entrada com mola. O CSS cuida das animações dele; isto é pro que
// é animado por JavaScript (a troca de frames de um sprite, um atraso de saída).

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

const lerAgora = (): boolean => typeof matchMedia === 'function' && matchMedia(QUERY).matches;

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(lerAgora);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const pref = matchMedia(QUERY);
    const update = () => setReduced(pref.matches);
    update();
    pref.addEventListener('change', update);
    return () => pref.removeEventListener('change', update);
  }, []);
  return reduced;
}
