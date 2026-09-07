// Cabeçalho do app: abas, data de hoje, XP/nível e Sair.
// Mesmos ids/classes do markup antigo (o CSS e o smoke test dependem deles).
// A aba ativa vive no store; o App mostra o conteúdo certo lendo o store.
// Em tela grande (≥1100px) vira a barra do pacote "Café de casa" (layout B7, 2026-09-07): a marca à
// esquerda, as abas como texto no meio, e à direita o XP com o avatar (que é o Sair). Abaixo disso o
// DOM é o de sempre — o celular não muda.

import { useMemo } from 'react';
import { computeStatsNow } from '../application/plan';
import { signOut } from '../application/session';
import { getLevel } from '../domain/progression';
import { strings } from '../shared/strings';
import { useWide } from '../shared/useWide';
import { setTab, TABS, useAppState } from '../store/store';

function todayLabel(): string {
  return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** A pata da marca (traço, estilo lucide — o mesmo do pacote). */
function PawIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="4" r="2" /><circle cx="18" cy="8" r="2" /><circle cx="20" cy="16" r="2" />
      <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.5 15.5a2.5 2.5 0 0 1 .3-3.8l4.2-1.7Z" />
    </svg>
  );
}

export function Header() {
  // computeStatsNow é memoizado por versão do store: o Plano e o cabeçalho pagam uma passada só.
  const { tab, totalXP, user } = useAppState((s) => ({ tab: s.uiTab, totalXP: computeStatsNow().totalXP, user: s.user }));
  const today = useMemo(todayLabel, []);
  const wide = useWide();

  const tabs = (
    <div className="nav-tabs">
      {TABS.map((t) => (
        <button
          key={t}
          id={`tab-${t}`}
          className={'nav-tab' + (t === tab ? ' active' : '')}
          onClick={() => setTab(t)}
        >
          {strings.tabs[t]}
        </button>
      ))}
    </div>
  );
  const xp = (
    <div className="xp-badge">
      <span id="top-xp">{strings.header.xp(totalXP)}</span>
      <span className="level-tag" id="top-level">{getLevel(totalXP)}</span>
    </div>
  );

  if (wide) {
    const initial = (user?.displayName || user?.email || '·').trim().charAt(0).toUpperCase();
    return (
      <div className="topbar topbar-wide">
        <div className="brand"><PawIcon />{strings.header.brand}<span className="brand-dot">.</span></div>
        {tabs}
        <div className="topbar-right">
          <span className="sub" id="today-label" hidden>{today}</span>
          {xp}
          {/* O avatar é o Sair: o pacote tem só a inicial no círculo, sem botão de texto. */}
          <button className="avatar-btn" onClick={() => void signOut()} aria-label={strings.header.sair} title={strings.header.sair}>
            {initial}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="topbar">
      <div className="topbar-left">
        {tabs}
        <div className="sub" id="today-label">{today}</div>
      </div>
      <div className="topbar-right">
        {xp}
        <button className="icon-btn" onClick={() => void signOut()}>
          {strings.header.sair}
        </button>
      </div>
    </div>
  );
}
