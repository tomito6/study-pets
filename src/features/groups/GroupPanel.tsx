// "Novo grupo" / "Editar grupo": nome e objetivo sobre um trecho já escolhido na
// lista. O trecho não se edita aqui — pra mudar, apaga e seleciona de novo.

import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { addGroup, deleteGroup, updateGroup } from '../../application/groups';
import { blocksForDay } from '../../application/plan';
import { groupProgress } from '../../domain/groups';
import { formatCompact } from '../../domain/settings';
import type { DateKey, StudyGroup, TimeString } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { Modal } from '../shell/Modal';

const t = strings.groups;

export interface GroupTarget {
  dateKey: DateKey;
  start: TimeString;
  end: TimeString;
  /** Presente ao editar. */
  group?: StudyGroup;
}

interface Props {
  target: GroupTarget | null;
  onClose: () => void;
}

/** O formulário só existe enquanto o modal está aberto — assim reabre sempre limpo. */
function GroupForm({ target, onClose }: { target: GroupTarget; onClose: () => void }) {
  const [name, setName] = useState(target.group?.name ?? '');
  const [goal, setGoal] = useState(target.group?.goal ?? '');
  const editing = !!target.group;

  const p = groupProgress(target, blocksForDay(target.dateKey), undefined);
  const summary = t.summary(target.start, target.end, p.total, formatCompact(p.minsTotal));

  const save = () => {
    const input = { start: target.start, end: target.end, name, goal };
    const r = target.group
      ? updateGroup(target.dateKey, target.group.id, input)
      : addGroup(target.dateKey, input);
    if (!r.ok) {
      showToast(t.refusal[r.reason]);
      return;
    }
    onClose();
  };

  const remove = () => {
    if (!target.group) return;
    deleteGroup(target.dateKey, target.group.id);
    showToast(t.deleted);
    onClose();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') save();
  };

  return (
    <>
      <div className="group-summary" id="group-summary">{summary}</div>
      <div className="field-group">
        <label htmlFor="grp-name">{t.name}</label>
        <input
          type="text"
          id="grp-name"
          placeholder={t.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onKey}
          maxLength={60}
          autoFocus
        />
      </div>
      <div className="field-group">
        <label htmlFor="grp-goal">{t.goal}</label>
        <input
          type="text"
          id="grp-goal"
          placeholder={t.goalPlaceholder}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={onKey}
          maxLength={120}
        />
      </div>
      <div className="btn-row">
        <button className="reset-btn" onClick={onClose}>{t.cancel}</button>
        <button className="save-btn" id="grp-save" onClick={save}>{editing ? t.save : t.create}</button>
      </div>
      {editing && (
        <button className="danger-btn" id="grp-delete" style={{ marginTop: 10 }} onClick={remove}>
          {t.delete}
        </button>
      )}
    </>
  );
}

export function GroupPanel({ target, onClose }: Props) {
  return (
    <Modal id="group-panel" open={!!target} title={target?.group ? t.panelEdit : t.panelNew} onClose={onClose}>
      {target && <GroupForm key={target.group?.id ?? 'new'} target={target} onClose={onClose} />}
    </Modal>
  );
}
