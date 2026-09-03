// "Resumo do dia": 4 tiles + uma frase dizendo o que acontece no fim do dia.

import { formatCompact, summarizeConfig } from '../../domain/settings';
import type { PlannerConfig } from '../../domain/types';
import { strings } from '../../shared/strings';

const t = strings.settings.summary;

export function ConfigPreview({ cfg }: { cfg: PlannerConfig }) {
  const s = summarizeConfig(cfg);
  if (s.kind === 'warn') {
    return (
      <div className="st-card" id="config-preview">
        <div className="sts-note warn">{t.warn[s.reason]}</div>
      </div>
    );
  }
  const note =
    s.diffMins > 0
      ? { cls: 'warn', text: t.noteOver(s.diffMins, s.end) }
      : s.diffMins < 0
        ? { cls: 'warn', text: t.noteUnder(s.actualEnd, Math.abs(s.diffMins), s.end) }
        : { cls: 'ok', text: t.noteOk(s.actualEnd) };

  const tile = (num: string | number, lbl: string, cls = '') => (
    <div className={'sts-tile ' + cls}>
      <div className="sts-num">{num}</div>
      <div className="sts-lbl">{lbl}</div>
    </div>
  );

  return (
    <div className="st-card" id="config-preview">
      <div className="st-summary">
        {tile(s.pomos, t.tiles.pomos)}
        {tile(formatCompact(s.studyMins), t.tiles.study)}
        {tile(formatCompact(s.pauseMins), t.tiles.pauses)}
        {tile(t.xpApprox(s.totalXP), t.tiles.xp, 'accent')}
      </div>
      {s.windowsCount > 1 && <div className="st-hint">{t.windows(s.windowsCount)}</div>}
      <div className={'sts-note ' + note.cls}>{note.text}</div>
    </div>
  );
}
