// "🕘 Estrutura do dia" (era "Janelas do dia" até 2026-09-17): as janelas de estudo e,
// desde 2026-10-01, o RITMO do pomodoro só deste dia (a rotina fica nas Configurações —
// são duas coisas diferentes, e o nome de cada tela diz qual é qual) — o mesmo editor
// das Configurações, num modal — e, desde o Arranjo 1 de
// prototypes/estrutura-da-rotina.html, o "Como fica o dia" DESTE dia, com os eventos de
// verdade, reagindo ao editor antes do Salvar (features/settings/DayPreview.tsx). Mais os atalhos: "Dia livre" (com confirmação curta) e
// "Restaurar rotina" quando o dia está editado. O "▶ Começar agora" saiu em 2026-09-14,
// a pedido do Tomi (era o item 1a do PENDENCIAS, pedido três vezes).

import { useEffect, useState } from 'react';
import {
  clearDayWindows,
  dayEdited,
  dayRhythmNow,
  effectiveWindows,
  previewDayPlan,
  restKindKey,
  routineRhythmOf,
  saveDayStructure,
  setDayMode,
  setDayOff,
} from '../../application/dayWindows';
import type { DayStructureResult, DayWindowsRefusal } from '../../application/dayWindows';
import { dayModeOf } from '../../application/plan';
import { requestSettings } from '../../application/settings';
import { state, useAppState } from '../../store/store';
import { parseRhythmDraft, rhythmDraftOf, sameRhythm } from '../../domain/dayRhythm';
import type { RhythmDraft } from '../../domain/dayRhythm';
import { dk } from '../../domain/time';
import type { DateKey, StudyWindow } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { DayPreview } from '../settings/DayPreview';
import { StudyWindowsEditor, appendWindow } from '../settings/StudyWindowsEditor';
import { Modal } from '../shell/Modal';
import { useMinuteTick } from './useMinuteTick';

const t = strings.dayWindows;

interface Props {
  /** Dia sendo editado; null = fechado. */
  dateKey: DateKey | null;
  onClose: () => void;
}

export function DayWindowsPanel({ dateKey, onClose }: Props) {
  const [windows, setWindows] = useState<StudyWindow[]>([]);
  // O ritmo SÓ deste dia, como a pessoa digita (texto, pra permitir campo vazio no meio da edição).
  const [rhythm, setRhythm] = useState<RhythmDraft>({ pomo: '', shortBreak: '', longBreak: '' });
  const [confirmOff, setConfirmOff] = useState(false);

  useEffect(() => {
    if (!dateKey) return;
    setWindows(effectiveWindows(dateKey).map((w) => ({ ...w })));
    setRhythm(rhythmDraftOf(dayRhythmNow(dateKey)));
    setConfirmOff(false);
  }, [dateKey]);

  const key = dateKey ?? '';
  const rest = key ? restKindKey(key) : null; // fim de semana pausado ou dia livre
  const off = rest !== null;
  useAppState((s2) => s2.config); // a rotina (e o ritmo do dia, que mora no estado) mudando redesenha
  const edited = key ? dayEdited(key) : false;
  const refuse = (reason: DayWindowsRefusal) => showToast(t.refusal[reason]);
  // O ritmo em vigor neste dia (de agora em diante, se ele já mudou no meio) e o da rotina —
  // num dia passado seria o pomodoro com que ele foi gerado (ver domain/configHistory.ts).
  const ritmoDoDia = key ? dayRhythmNow(key) : null;
  const ritmoDaRotina = key ? routineRhythmOf(key) : null;
  const ritmoRascunho = parseRhythmDraft(rhythm); // null = campo vazio ou fora da faixa
  /** O editor tem mudança não salva? (mesma comparação que o `useEffect` usa pra preencher.) */
  const sujo =
    key !== '' &&
    (JSON.stringify(windows.map((w) => [w.start, w.end])) !== JSON.stringify(effectiveWindows(key).map((w) => [w.start, w.end])) ||
      !ritmoRascunho ||
      !ritmoDoDia ||
      !sameRhythm(ritmoRascunho, ritmoDoDia));

  /** Janelas e ritmo numa escrita só; devolve se deu certo (a porta pro ritmo da rotina salva antes de ir). */
  const gravar = (): DayStructureResult => {
    if (!ritmoRascunho) return { ok: false, reason: 'invalid-rhythm' };
    return saveDayStructure(key, { windows, rhythm: ritmoRascunho });
  };
  const contar = (r: Extract<DayStructureResult, { ok: true }>): void => {
    // O ritmo que só vale do próximo bloco em diante é o que mais precisa ser dito.
    if (r.rhythm === 'from-now') showToast(t.rhythm.savedFromNow);
    else if (r.rhythm === 'whole-day') showToast(r.windows ? t.savedBoth : t.rhythm.savedWhole);
    else showToast(t.saved);
  };
  const save = () => {
    const r = gravar();
    if (!r.ok) {
      refuse(r.reason);
      return;
    }
    contar(r);
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
  // "Como fica o dia": o plano deste dia com as janelas que o editor tem AGORA — a
  // prévia reage antes de salvar (mudar o início pra 10:00 já mostra os pomos que cabem).
  // O "agora" só existe se o dia é hoje, e o tique do minuto o move pela régua.
  useMinuteTick();
  const agora = new Date();
  const hoje = key !== '' && key === dk(agora);
  // A prévia reage também ao ritmo do rascunho: 50 · 10 nos campos já mostra os pomos que
  // cabem — o dia inteiro se ele não começou, do próximo bloco em diante se já começou.
  const previewBlocks = key ? previewDayPlan(key, windows, ritmoRascunho, agora) : [];
  /**
   * A porta pro ritmo DA ROTINA: fecha o modal ANTES de pedir (dois modais abertos deixariam
   * o overlay do dia por cima da página que acabou de abrir) e abre as Configurações já
   * na seção do ritmo, acesa. E **salva o que o editor tem**, se tiver mudado: quem mexeu
   * num horário e tocou na porta perdia a edição, calado. Salvar aqui é o que a
   * pessoa faria no clique seguinte; o que é inválido é recusado e ninguém sai do lugar.
   */
  const irAoRitmo = (): void => {
    if (sujo) {
      const r = gravar();
      if (!r.ok) {
        refuse(r.reason);
        return;
      }
      contar(r);
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
      {/* O ritmo SÓ DESTE DIA (2026-10-01, pedido do Tomi: "deveria ser 2 coisas separadas —
          pelo próprio nome já deveríamos saber a diferença"). Até então os três números eram
          só uma vitrine do ritmo da rotina com um "Mudar →" pras Configurações: tudo no modal
          era do dia, menos isto. Agora os tiles se editam aqui e valem pra este dia; a rotina
          continua na seção de mesmo nome das Configurações, e o botão ao lado leva até ela.
          Em hoje com algo já vivido a troca vale do próximo bloco em diante (ver
          application/dayWindows.ts) — a prévia logo abaixo mostra isso antes do Salvar. */}
      <div className="dw-rhythm" id="day-windows-rhythm">
        <div className="dw-head">
          <label>{t.rhythm.label}</label>
          <button type="button" className="ghost-btn" id="day-windows-rhythm-btn" onClick={irAoRitmo}>{t.rhythm.change}</button>
        </div>
        <div className="dw-rhythm-tiles">
          <label className="dw-rt accent">
            <input type="number" inputMode="numeric" id="day-rhythm-pomo" min={1} max={600} value={rhythm.pomo} onChange={(e) => setRhythm({ ...rhythm, pomo: e.target.value })} />
            <span>{t.rhythm.study}</span>
          </label>
          <label className="dw-rt">
            <input type="number" inputMode="numeric" id="day-rhythm-short" min={1} max={600} value={rhythm.shortBreak} onChange={(e) => setRhythm({ ...rhythm, shortBreak: e.target.value })} />
            <span>{t.rhythm.short}</span>
          </label>
          <label className="dw-rt">
            <input type="number" inputMode="numeric" id="day-rhythm-long" min={1} max={600} value={rhythm.longBreak} onChange={(e) => setRhythm({ ...rhythm, longBreak: e.target.value })} />
            <span>{t.rhythm.long}</span>
          </label>
        </div>
        {/* Só quando o dia não está no ritmo da rotina: diz pra onde o "Restaurar rotina" volta. */}
        {ritmoDaRotina && (!ritmoRascunho || !sameRhythm(ritmoRascunho, ritmoDaRotina)) && (
          <div className="dw-rhythm-note" id="day-rhythm-note">{t.rhythm.routine(ritmoDaRotina.pomo, ritmoDaRotina.shortBreak, ritmoDaRotina.longBreak)}</div>
        )}
      </div>
      <DayPreview blocks={previewBlocks} nowMins={hoje ? agora.getHours() * 60 + agora.getMinutes() : null} live={modo === 'live'} />
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
