// Anima um sprite de frames sequenciais (0.png, 1.png, …) enquanto `active`.

import { useEffect, useState } from 'react';

const FRAME_MS = 180;

export function useSpriteFrame(frames: number, active: boolean): number {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active || frames <= 1) return;
    setFrame(0);
    const id = setInterval(() => setFrame((f) => (f + 1) % frames), FRAME_MS);
    return () => clearInterval(id);
  }, [active, frames]);
  return frame;
}
