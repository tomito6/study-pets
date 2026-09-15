// "Nota no bloco": uma frase curta presa a uma linha só do plano — "lavar roupa" na
// pausa longa, "lista 3" no Estudo 3. Abre pela mesma seleção do grupo, quando o trecho
// escolhido é uma linha só, e tocando na própria nota na linha. O bloco não se digita
// aqui: ele já foi escolhido na lista.

import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { blockNote, clearBlockNote, setBlockNote } from '../../application/notes';
import { MAX_NOTE_LENGTH } from '../../domain/notes';
import type { DateKey, StudyBlock } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { Modal } from '../shell/Modal';

const t = strings.notes;

export interface NoteTarget {
  dateKey: DateKey;
  block: StudyBlock;
}

interface Props {
  target: NoteTarget | null;
  onClose: () => void;
}

/** O formulário só existe enquanto o modal está aberto — assim reabre sempre limpo. */
function NoteForm({ target, onClose }: { target: NoteTarget; onClose: () => void }) {
  const existing = blockNote(target.dateKey, target.block) ?? '';
  const [text, setText] = useState(existing);
  const editing = existing !== '';

  const save = () => {
    const r = setBlockNote(target.dateKey, target.block, text);
    if (!r.ok) {
      showToast(t.refusal[r.reason]);
      return;
    }
    if (editing && !r.note) showToast(t.deleted); // apagou o texto e salvou: é o mesmo que Apagar
    onClose();
  };

  const remove = () => {
    const r = clearBlockNote(target.dateKey, target.block);
    if (!r.ok) {
      showToast(t.refusal[r.reason]);
      return;
    }
    showToast(t.deleted);
    onClose();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') save();
  };

  return (
    <>
      <div className="group-summary" id="note-summary">
        {t.summary(target.block.name, target.block.time, target.block.endTime)}
      </div>
      <div className="field-group">
        <label htmlFor="note-text">{t.label}</label>
        <input
          type="text"
          id="note-text"
          placeholder={t.placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          maxLength={MAX_NOTE_LENGTH}
          autoFocus
        />
        <div className="st-hint">{t.hint}</div>
      </div>
      <div className="btn-row">
        <button className="reset-btn" onClick={onClose}>{t.cancel}</button>
        <button className="save-btn" id="note-save" onClick={save}>{t.save}</button>
      </div>
      {editing && (
        <button className="danger-btn" id="note-delete" style={{ marginTop: 10 }} onClick={remove}>
          {t.delete}
        </button>
      )}
    </>
  );
}

export function NotePanel({ target, onClose }: Props) {
  const editing = !!target && !!blockNote(target.dateKey, target.block);
  return (
    <Modal id="note-panel" open={!!target} title={editing ? t.panelEdit : t.panelNew} onClose={onClose}>
      {target && <NoteForm key={`${target.dateKey}-${target.block.time}`} target={target} onClose={onClose} />}
    </Modal>
  );
}
