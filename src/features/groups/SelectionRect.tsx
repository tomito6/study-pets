// O retângulo tracejado em volta das linhas selecionadas — o grupo que vai nascer.
// Mede as linhas no DOM (elas podem estar dentro de caixas de grupo) e se posiciona
// em relação à lista. `pointer-events: none`, pra não atrapalhar o hit-test do arrasto.

import { useLayoutEffect, useState } from 'react';
import type { Range } from './useGroupSelection';

interface Props {
  range: Range | null;
  /** id do container `.blocks-list` (position: relative). */
  listId: string;
}

const PAD = 4;

export function SelectionRect({ range, listId }: Props) {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  const from = range?.from ?? -1;
  const to = range?.to ?? -1;

  useLayoutEffect(() => {
    if (from < 0) {
      setBox(null);
      return;
    }
    const list = document.getElementById(listId);
    const first = list?.querySelector(`[data-row="${from}"]`);
    const last = list?.querySelector(`[data-row="${to}"]`);
    if (!list || !first || !last) {
      setBox(null);
      return;
    }
    const l = list.getBoundingClientRect();
    const a = first.getBoundingClientRect();
    const b = last.getBoundingClientRect();
    setBox({ top: a.top - l.top - PAD, height: b.bottom - a.top + PAD * 2 });
  }, [from, to, listId]);

  if (!box) return null;
  return <div className="selection-rect" style={{ top: box.top, height: box.height }} />;
}
