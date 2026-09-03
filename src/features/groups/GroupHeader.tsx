// Cabeçalho de um grupo na lista: nome, objetivo e progresso. Tocar abre a edição.
// Neutro, com o acento da sessão do primeiro bloco — não é um segundo sistema de cores.

import type { GroupProgress } from '../../domain/groups';
import { formatCompact } from '../../domain/settings';
import type { StudyGroup } from '../../domain/types';
import { strings } from '../../shared/strings';

const t = strings.groups;

interface Props {
  group: StudyGroup;
  progress: GroupProgress;
  /** Classe de cor da sessão (`s0`…`s5`). */
  sessionClass: string;
  onClick: () => void;
}

export function GroupHeader({ group, progress: p, sessionClass, onClick }: Props) {
  const empty = p.total === 0;
  const complete = !empty && p.done === p.total;
  const className = `group-header ${sessionClass}` + (complete ? ' complete' : '') + (empty ? ' empty' : '');
  return (
    <div className={className} role="button" title={t.headerTitle} onClick={onClick}>
      <div className="gh-main">
        <div className="gh-name">{group.name}</div>
        {group.goal && <div className="gh-goal">🎯 {group.goal}</div>}
      </div>
      <div className="gh-side">
        {empty ? (
          <>
            <div className="gh-progress">{t.range(group.start, group.end)}</div>
            <div className="gh-mins">{t.noStudy}</div>
          </>
        ) : (
          <>
            <div className="gh-progress">{complete ? t.progressDone(p.done, p.total) : t.progress(p.done, p.total)}</div>
            <div className="gh-mins">{t.progressMins(formatCompact(p.minsDone), formatCompact(p.minsTotal))}</div>
          </>
        )}
      </div>
    </div>
  );
}
