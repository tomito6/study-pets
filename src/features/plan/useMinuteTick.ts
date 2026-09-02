// Re-renderiza na virada de cada minuto, pra manter o destaque do bloco "agora"
// alinhado com o relógio real. Substitui o startNowTick do legado.

import { useEffect, useState } from 'react';

export function useMinuteTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const msToNextMinute = 60000 - (Date.now() % 60000);
    const timeout = setTimeout(() => {
      setTick((t) => t + 1);
      interval = setInterval(() => setTick((t) => t + 1), 60000);
    }, msToNextMinute);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);
  return tick;
}
