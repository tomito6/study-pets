// "Salvando… / Salvo ✓" no canto. Lê o status publicado por application/save.

import { useAppState } from '../../store/store';

export function SaveIndicator() {
  const save = useAppState((_, d) => d.save);
  return (
    <div id="save-indicator" className={save.visible ? 'show' : ''}>
      {save.text}
    </div>
  );
}
