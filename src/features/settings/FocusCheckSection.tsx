// Configurações → Geral → "Em teste": o interruptor do "check só pelo foco" (versão de
// teste da decisão do PENDENCIAS 6 — ver application/checkMode.ts). Preferência DESTE
// dispositivo, como o tema e o volume: aplica na hora, sem rascunho nem "Salvar".

import { setFocusOnlyCheck } from '../../application/checkMode';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';

const t = strings.settings.focusCheck;

export function FocusCheckSection() {
  const on = useAppState((_s, d) => d.focusOnlyCheck);
  return (
    <div className="st-section" id="st-sec-focus-check">
      <div className="st-section-head"><div className="st-section-title">{t.title}</div></div>
      <div className="st-card">
        <div className="st-toggle-row">
          <div>
            <div className="st-toggle-txt">{t.toggle}</div>
            <div className="st-toggle-sub">{t.toggleSub}</div>
          </div>
          <label className="st-switch">
            <input type="checkbox" id="cfg-focus-check" checked={on} onChange={(e) => setFocusOnlyCheck(e.target.checked)} />
            <span className="st-switch-track"><span className="st-switch-knob" /></span>
          </label>
        </div>
      </div>
    </div>
  );
}
