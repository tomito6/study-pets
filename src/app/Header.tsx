// Cabeçalho do app: abas, data de hoje, XP/nível e Sair.
// Mesmos ids/classes do markup antigo (o CSS e o smoke test dependem deles).
// A aba ativa vive no store; o App mostra o conteúdo certo lendo o store.
// Em tela grande (≥1100px) o mesmo elemento vira o trilho à esquerda: o CSS empilha o que já existe e
// entram três pedaços a mais — a barra pro próximo nível, o personagem com o pet e o rodapé com
// Configurações e Sair. Abaixo disso nada muda: os pedaços a mais nem são montados.

import { useMemo } from 'react';
import { activePet } from '../application/pets';
import { computeStatsNow } from '../application/plan';
import { signOut } from '../application/session';
import { nextLevel } from '../domain/analytics';
import { petForm, petLevel } from '../domain/pets';
import { getLevel, getLevelPct } from '../domain/progression';
import { useSpriteFrame } from '../features/profile/useSpriteFrame';
import { strings } from '../shared/strings';
import { useWide } from '../shared/useWide';
import { setTab, TABS, useAppState } from '../store/store';

const CHAR_FRAMES = 4;

function todayLabel(): string {
  return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** O personagem e o pet equipado no pé do trilho — a companhia que no celular só aparece no Perfil. */
function RailScene() {
  const pet = useAppState(() => activePet());
  const form = pet ? petForm(pet) : null;
  const charFrame = useSpriteFrame(CHAR_FRAMES, true);
  const petFrame = useSpriteFrame(form?.frames ?? 1, !!form);
  const t = strings.header.rail;
  return (
    <div className="rail-scene">
      <div className="rail-sprites">
        <img className="rail-char" src={`idle/user/${charFrame}.png`} alt={strings.login.charAlt} />
        {pet && form && <img className="rail-pet" src={form.sprite(petFrame)} alt={pet.name} />}
      </div>
      <div className="rail-pet-name">{pet ? t.pet(pet.name, petLevel(pet)) : t.noPet}</div>
    </div>
  );
}

export function Header() {
  // computeStatsNow é memoizado por versão do store: o Plano e o cabeçalho pagam uma passada só.
  const { tab, totalXP } = useAppState((s) => ({ tab: s.uiTab, totalXP: computeStatsNow().totalXP }));
  const today = useMemo(todayLabel, []);
  const wide = useWide();
  const next = wide ? nextLevel(totalXP) : null;

  const sair = (
    <button className="icon-btn" onClick={() => void signOut()}>
      {strings.header.sair}
    </button>
  );

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
        {wide && (
          <div className="rail-xp">
            <div className="bar-track"><div className="bar-fill" style={{ width: `${getLevelPct(totalXP)}%` }} /></div>
            <div className="rail-xp-sub">{next ? strings.header.rail.toNext(next.threshold - totalXP, next.name) : strings.header.rail.maxLevel}</div>
          </div>
        )}
        {/* No pé do trilho só o Sair: o ⚙️ flutuante continua no laptop (o Tomi preferiu). */}
        {wide ? <div className="rail-foot">{sair}</div> : sair}
      </div>
      {wide && <RailScene />}
    </div>
  );
}
