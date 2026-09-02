// Cabeçalho do app: abas, data de hoje, XP/nível e Sair.
// Mesmos ids/classes do markup antigo (o CSS e o smoke test dependem deles).
// A aba ativa vive no store; o legado escuta o store e mostra o conteúdo certo.

import { useMemo } from 'react';
import { signOut } from '../application/session';
import { getLevel } from '../domain/progression';
import { strings } from '../shared/strings';
import { setTab, TABS, useAppState } from '../store/store';

function todayLabel(): string {
  return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function Header() {
  const { tab, totalXP } = useAppState((s, d) => ({ tab: s.uiTab, totalXP: d.stats?.totalXP ?? 0 }));
  const today = useMemo(todayLabel, []);

  return (
    <div className="topbar">
      <div className="topbar-left">
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
        <div className="sub" id="today-label">{today}</div>
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
  );
}
