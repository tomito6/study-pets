// A caixa de um grupo na lista: cabeçalho (nome, objetivo, progresso) e, dentro
// dela, as linhas membros. Tocar no cabeçalho abre a edição. Cada grupo do dia
// tem uma cor da paleta de grupos (`gc-0`…`gc-5`, no CSS) — fria e luminosa, fora
// da paleta das sessões: grupo é outra camada, não outra sessão.

import type { ReactNode } from 'react';
import type { GroupProgress } from '../../domain/groups';
import { formatCompact } from '../../domain/settings';
import type { StudyGroup } from '../../domain/types';
import { strings } from '../../shared/strings';

const t = strings.groups;

interface Props {
  group: StudyGroup;
  progress: GroupProgress;
  /** Nenhum bloco cabe no trecho — só o cabeçalho, tracejado, pra editar ou apagar. */
  empty?: boolean;
  /** `gc-0`…`gc-5`: a cor do grupo, pela ordem dele no dia. */
  colorClass: string;
  onEdit: () => void;
  children?: ReactNode;
}

export function GroupBox({ group, progress: p, empty = false, colorClass, onEdit, children }: Props) {
  const noStudy = p.total === 0;
  const complete = !noStudy && p.done === p.total;
  const pct = p.minsTotal > 0 ? Math.round((p.minsDone / p.minsTotal) * 100) : 0;
  return (
    <div className={`group-box ${colorClass}` + (complete ? ' complete' : '') + (empty ? ' empty' : '')}>
      <div className="group-header" role="button" title={t.headerTitle} onClick={onEdit}>
        <div className="gh-main">
          <div className="gh-name">{group.name}</div>
          {group.goal && <div className="gh-goal">🎯 {group.goal}</div>}
        </div>
        <div className="gh-side">
          {noStudy ? (
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
      {!noStudy && (
        <div className="gh-bar">
          <div className="gh-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      {children && <div className="group-rows">{children}</div>}
    </div>
  );
}
