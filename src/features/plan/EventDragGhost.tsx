// O fantasma do evento arrastado: onde ele cai se soltar agora, desenhado dentro
// da lista do Dia. Mesma ideia do `SelectionRect` — `pointer-events: none` e
// posição relativa à lista, medida no layout.
//
// A altura sai da geometria da própria lista (que não é proporcional ao tempo),
// então o fantasma cobre as linhas que o evento vai ocupar — não uma altura
// calculada da duração.

import { useLayoutEffect, useState } from 'react';
import { strings } from '../../shared/strings';
import type { DragPreview } from '../events/useEventDrag';

interface Props {
  preview: DragPreview | null;
  /** id do container `.blocks-list` (position: relative). */
  listId: string;
}

const MIN_H = 28;

export function EventDragGhost({ preview, listId }: Props) {
  const [top, setTop] = useState<number | null>(null);
  const docTop = preview?.top ?? 0;
  const docBottom = preview?.bottom ?? 0;

  useLayoutEffect(() => {
    const list = preview ? document.getElementById(listId) : null;
    if (!list) {
      setTop(null);
      return;
    }
    setTop(docTop - (list.getBoundingClientRect().top + window.scrollY));
  }, [preview, docTop, listId]);

  if (!preview || top === null) return null;
  return (
    <div className="drag-ghost" id="drag-ghost" style={{ top, height: Math.max(MIN_H, docBottom - docTop) }}>
      <span className="dg-time">{strings.plan.dragGhost(preview.start, preview.end)}</span>
      <span className="dg-name">{preview.source.block.name}</span>
    </div>
  );
}
