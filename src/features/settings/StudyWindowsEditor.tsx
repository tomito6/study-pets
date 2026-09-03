// Uma linha por janela: início → fim, duração à direita, ✕ pra remover.

import { formatWindowDuration, nextWindowAfter, windowMinutes } from '../../domain/settings';
import type { StudyWindow } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';

const t = strings.settings.windows;

interface Props {
  windows: StudyWindow[];
  onChange: (windows: StudyWindow[]) => void;
}

export function StudyWindowsEditor({ windows, onChange }: Props) {
  const update = (i: number, patch: Partial<StudyWindow>) =>
    onChange(windows.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const remove = (i: number) => {
    if (windows.length <= 1) {
      showToast(t.atLeastOne);
      return;
    }
    onChange(windows.filter((_, j) => j !== i));
  };

  return (
    <div id="cfg-windows">
      {windows.map((w, i) => {
        const mins = windowMinutes(w);
        const bad = mins !== null && mins <= 0;
        return (
          <div className="sw-row" key={i}>
            <input type="time" value={w.start} className="swc-start" aria-label={t.startLabel} onChange={(e) => update(i, { start: e.target.value })} />
            <span className="sw-arrow">→</span>
            <input type="time" value={w.end} className="swc-end" aria-label={t.endLabel} onChange={(e) => update(i, { end: e.target.value })} />
            <span className={'swc-dur sw-dur' + (bad ? ' bad' : '')}>
              {mins === null ? '' : bad ? t.endBeforeStart : formatWindowDuration(mins)}
            </span>
            <button type="button" className="sw-del" title={t.remove} onClick={() => remove(i)}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

/** Botão "+ Adicionar" usa isto: propõe começar onde a última janela terminou. */
export const appendWindow = (windows: StudyWindow[]): StudyWindow[] => [...windows, nextWindowAfter(windows)];
