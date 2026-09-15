// A folha do bloco: o que o botão direito (e o dedo segurado) abrem numa linha de
// estudo ou pausa — horário, duração que vale, ciclo, o que entra (ou entrou) de XP e
// moeda, o grupo a que pertence, e a nota, editável ali mesmo. A nota mora aqui porque
// é um dado do bloco como os outros (ver domain/notes.ts e domain/blockSheet.ts).
//
// O bloco não se escolhe aqui: ele já foi tocado na lista. Dia encerrado mostra tudo,
// mas a nota fica como está.

import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { groupsForDay } from '../../application/groups';
import { blockNote, canEditNotes, clearBlockNote, setBlockNote } from '../../application/notes';
import { blockFacts } from '../../domain/blockSheet';
import { MAX_NOTE_LENGTH } from '../../domain/notes';
import type { DateKey, StudyBlock } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { state } from '../../store/store';
import { Modal } from '../shell/Modal';

const t = strings.blockSheet;
const tn = strings.notes;
const NUM_CYCLES = 6;

export interface BlockSheetTarget {
  dateKey: DateKey;
  block: StudyBlock;
}

interface Props {
  target: BlockSheetTarget | null;
  onClose: () => void;
}

/** O corpo só existe enquanto a folha está aberta — assim reabre sempre com o bloco de agora. */
function SheetBody({ target, onClose }: { target: BlockSheetTarget; onClose: () => void }) {
  const { dateKey, block } = target;
  const f = blockFacts(block, state.checks[dateKey]?.[block.time], groupsForDay(dateKey));
  const editable = canEditNotes(dateKey);
  const existing = blockNote(dateKey, block) ?? '';
  const [text, setText] = useState(existing);
  const cycleName = f.cycle !== null ? (strings.plan.cycles[f.cycle % NUM_CYCLES] ?? strings.plan.cycleFallback) : null;

  const save = () => {
    const r = setBlockNote(dateKey, block, text);
    if (!r.ok) {
      showToast(tn.refusal[r.reason]);
      return;
    }
    if (existing && !r.note) showToast(tn.deleted); // apagou o texto e salvou: é o mesmo que Apagar
    onClose();
  };
  const remove = () => {
    const r = clearBlockNote(dateKey, block);
    if (!r.ok) {
      showToast(tn.refusal[r.reason]);
      return;
    }
    showToast(tn.deleted);
    onClose();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') save();
  };

  const row = (k: string, v: string, id?: string) => (
    <div className="bs-row" id={id}>
      <span className="bs-k">{k}</span>
      <span className="bs-v">{v}</span>
    </div>
  );

  return (
    <>
      <div className="bs-facts" id="bs-facts">
        {row(t.time, `${f.start} – ${f.end}`, 'bs-time')}
        {row(t.duration, t.mins(f.mins) + (f.paused ? ` · ${t.paused(f.paused)}` : ''), 'bs-duration')}
        {cycleName && row(t.cycle, cycleName, 'bs-cycle')}
        {row(f.checked ? t.earned : t.onFinish, t.gain(f.xp, f.coins) + (f.bonusPct ? ` · ${t.bonus(f.bonusPct)}` : ''), 'bs-gain')}
        {f.group && row(t.group, f.group.name + (f.group.goal ? ` · ${f.group.goal}` : ''), 'bs-group')}
      </div>
      <div className="field-group">
        <label htmlFor="note-text">{tn.label}</label>
        <input
          type="text"
          id="note-text"
          placeholder={tn.placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          maxLength={MAX_NOTE_LENGTH}
          disabled={!editable}
          autoFocus={editable && !existing}
        />
        <div className="st-hint">{editable ? tn.hint : t.readOnly}</div>
      </div>
      <div className="btn-row">
        <button className="reset-btn" id="bs-close" onClick={onClose}>{t.close}</button>
        {editable && (
          <button className="save-btn" id="note-save" onClick={save}>{tn.save}</button>
        )}
      </div>
      {editable && existing && (
        <button className="danger-btn" id="note-delete" style={{ marginTop: 10 }} onClick={remove}>
          {tn.delete}
        </button>
      )}
    </>
  );
}

export function BlockSheet({ target, onClose }: Props) {
  return (
    <Modal id="block-sheet" open={!!target} title={target ? target.block.name : ''} onClose={onClose}>
      {target && <SheetBody key={`${target.dateKey}-${target.block.time}`} target={target} onClose={onClose} />}
    </Modal>
  );
}
