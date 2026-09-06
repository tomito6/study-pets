// Cabeçalho do app em duas linhas: status (data de hoje, XP/nível, Sair) e, abaixo, as abas.
// Mesmos ids/classes do markup antigo (o CSS e o smoke test dependem deles).
// A aba ativa vive no store; o App mostra o conteúdo certo lendo o store.
// Experimento (2026-09-06): as abas têm dois estilos, "icons" e "underline" — ver `navStyle.ts`.
// O estilo vira `data-nav` no #app (o App põe), e o CSS decide o resto; aqui só os ícones entram ou não.

import { useMemo, type ReactElement } from 'react';
import { computeStatsNow } from '../application/plan';
import { signOut } from '../application/session';
import { getLevel } from '../domain/progression';
import { strings } from '../shared/strings';
import { setTab, TABS, useAppState, type Tab } from '../store/store';
import { useNavStyle } from './navStyle';

function todayLabels(): { long: string; short: string } {
  const d = new Date();
  return {
    long: d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
    short: d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }),
  };
}

// Ícones em pixel (grade 12×12, o mesmo padrão dos sprites): lista com check pro Plano, barras pra
// Análise. O Perfil é o próprio personagem — cinza fora da aba, em cor quando ela está aberta (CSS).
const ICONS: Record<Tab, ReactElement> = {
  plano: (
    <svg className="nav-icon" viewBox="0 0 12 12" aria-hidden="true">
      <g fill="currentColor">
        <rect x="0" y="1" width="3" height="3" />
        <rect x="5" y="2" width="7" height="1" />
        <rect x="0" y="5" width="3" height="1" />
        <rect x="0" y="7" width="3" height="1" />
        <rect x="0" y="6" width="1" height="1" />
        <rect x="2" y="6" width="1" height="1" />
        <rect x="5" y="6" width="7" height="1" />
        <rect x="0" y="9" width="3" height="1" />
        <rect x="0" y="11" width="3" height="1" />
        <rect x="0" y="10" width="1" height="1" />
        <rect x="2" y="10" width="1" height="1" />
        <rect x="5" y="10" width="7" height="1" />
      </g>
    </svg>
  ),
  analise: (
    <svg className="nav-icon" viewBox="0 0 12 12" aria-hidden="true">
      <g fill="currentColor">
        <rect x="0" y="7" width="3" height="5" />
        <rect x="4" y="2" width="3" height="10" />
        <rect x="8" y="5" width="3" height="7" />
      </g>
    </svg>
  ),
  perfil: <img className="nav-sprite" src="idle/user/0.png" alt="" />,
};

export function Header() {
  // computeStatsNow é memoizado por versão do store: o Plano e o cabeçalho pagam uma passada só.
  const { tab, totalXP } = useAppState((s) => ({ tab: s.uiTab, totalXP: computeStatsNow().totalXP }));
  const today = useMemo(todayLabels, []);
  const navStyle = useNavStyle();

  return (
    <div className="topbar">
      <div className="topbar-status">
        {/* A data longa vale a partir de 440px; abaixo disso o CSS troca pela curta (senão não cabe com o XP). */}
        <div className="sub" id="today-label">
          <span className="date-long">{today.long}</span>
          <span className="date-short">{today.short}</span>
        </div>
        <div className="topbar-right">
          <div className="xp-badge">
            <span id="top-xp">{strings.header.xp(totalXP)}</span>
            <span className="level-tag" id="top-level">{getLevel(totalXP)}</span>
          </div>
          <button className="icon-btn" onClick={() => void signOut()}>
            {strings.header.sair}
          </button>
        </div>
      </div>
      <div className="nav-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            id={`tab-${t}`}
            className={'nav-tab' + (t === tab ? ' active' : '')}
            onClick={() => setTab(t)}
          >
            {navStyle === 'icons' && ICONS[t]}
            <span>{strings.tabs[t]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
