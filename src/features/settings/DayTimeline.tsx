// A linha do tempo de um dia: uma régua de horas com um segmento por bloco. Hoje
// desenha "Como fica o dia" nas Configurações (os blocos da rotina); recebe qualquer
// lista de blocos, então serve igual pra um dia real, com o "agora".

import { timelineOf, timelinePosition } from '../../domain/timeline';
import type { TimelineKind } from '../../domain/timeline';
import { minsToTime } from '../../domain/time';
import type { StudyBlock } from '../../domain/types';
import { strings } from '../../shared/strings';

const t = strings.settings.timeline;
const KINDS: readonly TimelineKind[] = ['study', 'pause', 'event', 'interval'];

interface Props {
  blocks: StudyBlock[];
  /** Minutos desde a meia-noite do "agora", pra marcar na régua; omitido = sem marca. */
  nowMins?: number | null;
}

export function DayTimeline({ blocks, nowMins = null }: Props) {
  const tl = timelineOf(blocks);
  if (!tl) return null;
  const now = nowMins === null ? null : timelinePosition(tl, nowMins);
  const present = new Set(tl.segments.map((s) => s.kind));

  return (
    <div className="dtl" id="day-timeline">
      <div className="dtl-track">
        {tl.segments.map((s, i) => (
          <span
            key={`${s.startMin}-${i}`}
            className={`dtl-seg ${s.kind}`}
            style={{ left: `${s.left}%`, width: `${s.width}%` }}
            title={`${s.name} · ${minsToTime(s.startMin)}–${minsToTime(s.endMin)}`}
          />
        ))}
        {now !== null && <span className="dtl-now" style={{ left: `${now}%` }} title={t.now} />}
      </div>
      <div className="dtl-hours">
        {tl.hours.map((h) => (
          <span key={h.hour} style={{ left: `${h.left}%` }}>{h.hour}h</span>
        ))}
      </div>
      <div className="dtl-legend">
        {KINDS.filter((k) => present.has(k)).map((k) => (
          <span key={k}><i className={k} />{t[k]}</span>
        ))}
      </div>
    </div>
  );
}
