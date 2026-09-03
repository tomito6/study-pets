// A "zona de perigo": cancelar sessão (zera tudo, mantém a conta) e apagar a conta
// (exige digitar APAGAR; erros aparecem inline, o modal continua aberto pra tentar de novo).

import { useEffect, useState } from 'react';
import { deleteAccount } from '../../application/account';
import { cancelSession } from '../../application/settings';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { Modal } from '../shell/Modal';

const tc = strings.settings.cancel;
const td = strings.settings.deleteAccount;

interface CancelProps {
  open: boolean;
  onClose: () => void;
  /** Depois de cancelar, a tela de configurações fecha também. */
  onDone: () => void;
}

export function CancelSessionModal({ open, onClose, onDone }: CancelProps) {
  const confirm = () => {
    onClose();
    onDone();
    cancelSession();
  };
  return (
    <Modal id="cancel-confirm-panel" open={open} title={tc.title} onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--text)', marginBottom: 8, lineHeight: 1.5 }}>
        {tc.intro}<strong>{tc.introStrong}</strong>:
      </p>
      <ul style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px 18px', lineHeight: 1.7 }}>
        {tc.items.map((it) => <li key={it}>{it}</li>)}
      </ul>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.5 }}>
        {tc.outro}<strong>{tc.outroStrong}</strong>
      </p>
      <div className="btn-row">
        <button className="reset-btn" onClick={onClose}>{tc.back}</button>
        <button className="danger-btn" onClick={confirm}>{tc.confirm}</button>
      </div>
    </Modal>
  );
}

interface DeleteProps {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function DeleteAccountModal({ open, onClose, onDone }: DeleteProps) {
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTyped('');
    setStatus('');
    setBusy(false);
  }, [open]);

  const unlocked = typed.trim().toUpperCase() === td.keyword && !busy;

  const confirm = async () => {
    setBusy(true);
    const result = await deleteAccount((stage) => setStatus(td.status[stage]));
    if (result === 'ok') {
      onClose();
      onDone();
      showToast(td.done);
      return;
    }
    if (result === 'no-user') showToast(td.status['no-user']);
    else setStatus(td.status[result]);
    setBusy(false);
  };

  return (
    <Modal id="delete-account-panel" open={open} title={td.title} onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--text)', marginBottom: 8, lineHeight: 1.5 }}>
        {td.intro}<strong>{td.introStrong}</strong>{td.introRest}
      </p>
      <ul style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px 18px', lineHeight: 1.7 }}>
        {td.items.map((it) => <li key={it}>{it}</li>)}
      </ul>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
        {td.outro}<strong>{td.outroStrong}</strong>.
      </p>
      <div className="field-sublabel">{td.typeToConfirm[0]}<strong>{td.typeToConfirm[1]}</strong>{td.typeToConfirm[2]}</div>
      <input
        type="text"
        className="del-acc-input"
        id="del-acc-input"
        placeholder={td.keyword}
        autoComplete="off"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      <div className="del-acc-status" id="del-acc-status">{status}</div>
      <div className="btn-row">
        <button className="reset-btn" onClick={onClose}>{td.back}</button>
        <button className="danger-btn" id="del-acc-btn" disabled={!unlocked} onClick={() => void confirm()}>{td.confirm}</button>
      </div>
    </Modal>
  );
}
