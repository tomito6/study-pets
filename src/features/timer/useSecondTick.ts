// Re-renderiza a cada segundo enquanto `active`. Só quem mostra o relógio usa isto —
// o resto do app não precisa saber que um segundo passou.

import { useEffect, useState } from 'react';

export function useSecondTick(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return tick;
}
