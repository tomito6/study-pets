// "Como fica o dia" de um dia DE VERDADE: a régua com a refeição, a aula e o yoga dele
// (e o "agora", se é hoje), os quatro tiles e a frase do fim. Mora no modal "🕘 Estrutura
// do dia" (features/plan/DayWindowsPanel.tsx) e reage ao editor de janelas antes do
// Salvar. O ConfigPreview continua sendo o da rotina: só janelas e ritmo, sem evento.

import { formatCompact, summarizePlan } from '../../domain/settings';
import type { StudyBlock } from '../../domain/types';
import { eventDisplayName } from '../../domain/weekPreview';
import { strings } from '../../shared/strings';
import { DayTimeline } from './DayTimeline';

const t = strings.settings.summary;
const tp = strings.dayWindows.preview;

interface Props {
  blocks: StudyBlock[];
  /** Minutos desde a meia-noite do "agora"; null = não é hoje. */
  nowMins?: number | null;
  /** Dia ao vivo: o que está aqui é o que já aconteceu, não um plano. */
  live?: boolean;
}

export function DayPreview({ blocks, nowMins = null, live = false }: Props) {
  const s = summarizePlan(blocks);
  const hasPlan = blocks.some((b) => b.type === 'estudo' || b.type === 'pausa' || b.type === 'event');

  const tile = (num: string | number, lbl: string, cls = '') => (
    <div className={'sts-tile ' + cls}>
      <div className="sts-num">{num}</div>
      <div className="sts-lbl">{lbl}</div>
    </div>
  );

  let note: string;
  if (!hasPlan) note = live ? tp.liveEmpty : tp.empty;
  else {
    note = s.lastStudyEnd ? tp.ends(s.lastStudyEnd) + (s.after ? tp.then(eventDisplayName(s.after.name), s.after.end) : '.') : '';
    if (live) note = `${note} ${tp.live}`.trim();
  }

  return (
    <div className="dw-preview" id="day-preview">
      {/* A frase do fim mora no cabeçalho, ao lado do título ("Como fica o dia · Termina às
          18:00."): uma linha a menos num modal que tem de caber na tela sem rolar
          (2026-11-27). Quando é comprida — um compromisso depois, o aviso do ao vivo —, ela
          quebra pra linha de baixo sozinha. */}
      <div className="dw-head">
        <label>{tp.label}</label>
        <div className="dw-preview-note" id="day-preview-note">{note}</div>
      </div>
      {hasPlan && (
        <>
          <DayTimeline blocks={blocks} nowMins={nowMins} id="day-preview-timeline" />
          <div className="st-summary">
            {tile(s.pomos, t.tiles.pomos)}
            {tile(formatCompact(s.studyMins), t.tiles.study)}
            {tile(formatCompact(s.pauseMins), t.tiles.pauses)}
            {tile(t.xpApprox(s.totalXP), t.tiles.xp, 'accent')}
          </div>
        </>
      )}
    </div>
  );
}
