// "Janelas do dia": as janelas de estudo só deste dia — o mesmo editor das
// Configurações, num modal. Mais os atalhos: "Dia livre" (com confirmação curta) e
// "Restaurar rotina" quando o dia está editado. O "▶ Começar agora" saiu em 2026-09-14,
// a pedido do Tomi (era o item 1a do PENDENCIAS, pedido três vezes).

import { useEffect, useState } from 'react';
import {
  clearDayWindows,
  dayWindowsOverride,
  effectiveWindows,
  restKindKey,
  setDayMode,
  setDayOff,
  setDayWindows,
} from '../../application/dayWindows';
import type { DayWindowsRefusal } from '../../application/dayWindows';
import { dayModeOf } from '../../application/plan';
import { requestSettings } from '../../application/settings';
import { state, useAppState } from '../../store/store';
import type { DateKey, StudyWindow } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { StudyWindowsEditor, appendWindow } from '../settings/StudyWindowsEditor';
import { Modal } from '../shell/Modal';

const t = strings.dayWindows;

interface Props {
  /** Dia sendo editado; null = fechado. */
  dateKey: DateKey | null;
  onClose: () => void;
}

export function DayWindowsPanel({ dateKey, onClose }: Props) {
  const [windows, setWindows] = useState<StudyWindow[]>([]);
  const [confirmOff, setConfirmOff] = useState(false);

  useEffect(() => {
    if (!dateKey) return;
    setWindows(effectiveWindows(dateKey).map((w) => ({ ...w })));
    setConfirmOff(false);
  }, [dateKey]);

  const key = dateKey ?? '';
  const rest = key ? restKindKey(key) : null; // fim de semana pausado ou dia livre
  const off = rest !== null;
  const edited = key ? dayWindowsOverride(key) !== null : false;
  const refuse = (reason: DayWindowsRefusal) => showToast(t.refusal[reason]);
  /** O editor tem mudança não salva? (mesma comparação que o `useEffect` usa pra preencher.) */
  const sujo =
    key !== '' &&
    JSON.stringify(windows.map((w) => [w.start, w.end])) !==
      JSON.stringify(effectiveWindows(key).map((w) => [w.start, w.end]));

  const save = () => {
    const r = setDayWindows(key, windows);
    if (!r.ok) {
      refuse(r.reason);
      return;
    }
    showToast(t.saved);
    onClose();
  };
  const doOff = () => {
    const r = setDayOff(key);
    setConfirmOff(false);
    if (!r.ok) {
      refuse(r.reason);
      return;
    }
    showToast(t.dayOffSet);
    onClose();
  };
  const modo = key ? dayModeOf(key) : 'rotina';
  const { pomo, shortBreak, longBreak } = useAppState((s2) => s2.config);
  /**
   * A porta pro ritmo: fecha o modal ANTES de pedir (dois modais abertos deixariam o
   * overlay do dia por cima da página que acabou de abrir) e abre as Configurações já
   * na seção do ritmo, acesa. E **salva o que o editor tem**, se tiver mudado: quem mexeu
   * num horário e tocou no "Mudar →" perdia a edição, calado. Salvar aqui é o que a
   * pessoa faria no clique seguinte; janela inválida é recusada e ninguém sai do lugar.
   */
  const irAoRitmo = (): void => {
    if (sujo) {
      const r = setDayWindows(key, windows);
      if (!r.ok) {
        refuse(r.reason);
        return;
      }
      showToast(t.saved);
    }
    onClose();
    requestSettings('rhythm');
  };
  // Num dia que já tem corrida, a primeira delas diz desde quando o dia é ao vivo — é a
  // linha que uma barra de dois botões nunca poderia carregar.
  const desde = key ? (state.windowOverrides[key]?.studyWindows.find((w) => w.live)?.start ?? null) : null;
  const trocarModo = (m: 'rotina' | 'live') => {
    if (!key || m === modo) return;
    const r = setDayMode(key, m);
    if (!r.ok) {
      refuse(r.reason);
      return;
    }
    showToast(t.mode.changed);
    onClose();
  };
  const restore = () => {
    const r = clearDayWindows(key);
    if (!r.ok) {
      refuse(r.reason);
      return;
    }
    showToast(t.restored);
    onClose();
  };


  return (
    <Modal id="day-windows-panel" open={!!dateKey} title={t.title} onClose={onClose}>
      <p className="dw-intro">{t.intro}</p>
      {/* O seletor de modo mora AQUI e não numa barra própria: este modal já é onde o app
          decide as outras coisas de um dia só, e num dia misto a pergunta "e a manhã?"
          cabe numa linha de texto — numa barra de dois botões, não caberia. */}
      <div className="dw-mode" id="day-mode">
        <button type="button" className={'dm-btn' + (modo === 'rotina' ? ' on' : '')} id="day-mode-rotina" onClick={() => trocarModo('rotina')}>
          {t.mode.rotina}
        </button>
        <button type="button" className={'dm-btn' + (modo === 'live' ? ' on' : '')} id="day-mode-live" onClick={() => trocarModo('live')}>
          {t.mode.live}
        </button>
      </div>
      <p className="dw-mode-sub" id="day-mode-sub">
        {modo === 'live' ? (desde ? t.mode.liveSince(desde) : t.mode.liveSub) : t.mode.rotinaSub}
      </p>
      {windows.length > 0 ? (
        <div className="field-group">
          <div className="dw-head">
            <label>{t.windowsLabel}</label>
            <button type="button" className="add-block-btn" id="day-windows-add" onClick={() => setWindows(appendWindow(windows))}>{t.add}</button>
          </div>
          <StudyWindowsEditor windows={windows} onChange={setWindows} />
        </div>
      ) : (
        <div className="field-group">
          <div className="dw-off-note" id="day-windows-off-note">{rest === 'weekend' ? t.weekendNote : t.offNote}</div>
          <button type="button" className="ghost-btn" id="day-windows-add" onClick={() => setWindows(appendWindow([]))}>{t.add}</button>
        </div>
      )}
      {/* O ritmo NÃO é editado aqui de propósito: ele é global (vale todo dia), e este
          modal é do dia — um campo que diz "do dia" e muda a semana inteira seria uma
          armadilha. O que faltava era o caminho: a seção vivia em Configurações →
          Estrutura do dia e ninguém a achava (PENDENCIAS 4). O botão leva direto.
          Desde 2026-09-14 é um bloco com o MESMO nome da seção de destino ("Ritmo do
          pomodoro") e os três números em tiles: uma linha miúda "RITMO · 25 · 5 · 20 min"
          era lowkey demais pra se ler como pomodoro. */}
      <div className="dw-rhythm" id="day-windows-rhythm">
        <div className="dw-head">
          <label>{t.rhythm.label}</label>
          <button type="button" className="ghost-btn" id="day-windows-rhythm-btn" onClick={irAoRitmo}>{t.rhythm.change}</button>
        </div>
        <div className="dw-rhythm-tiles">
          <div className="dw-rt accent"><b>{pomo}</b><span>{t.rhythm.study}</span></div>
          <div className="dw-rt"><b>{shortBreak}</b><span>{t.rhythm.short}</span></div>
          <div className="dw-rt"><b>{longBreak}</b><span>{t.rhythm.long}</span></div>
        </div>
        <p className="dw-rhythm-sub">{t.rhythm.sub}</p>
      </div>
      <div className="dw-actions">
        {!off && !confirmOff && (
          <button type="button" className="ghost-btn" id="day-windows-off" onClick={() => setConfirmOff(true)}>{t.dayOff}</button>
        )}
        {confirmOff && (
          <div className="dw-confirm" id="day-windows-off-confirm-box">
            <span>{t.dayOffConfirm}</span>
            <div className="btn-row">
              <button type="button" className="reset-btn" onClick={() => setConfirmOff(false)}>{t.back}</button>
              <button type="button" className="save-btn" id="day-windows-off-confirm" onClick={doOff}>{t.dayOffYes}</button>
            </div>
          </div>
        )}
        {edited && (
          <button type="button" className="ghost-btn" id="day-windows-restore" onClick={restore}>{t.restore}</button>
        )}
      </div>
      <div className="btn-row" style={{ marginTop: 16 }}>
        <button type="button" className="reset-btn" onClick={onClose}>{t.cancel}</button>
        <button type="button" className="save-btn" id="day-windows-save" onClick={save} disabled={windows.length === 0}>{t.save}</button>
      </div>
    </Modal>
  );
}
