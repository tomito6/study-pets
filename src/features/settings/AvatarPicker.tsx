// O seletor de aparência do personagem, na aba Geral das Configurações.
//
// Diferente do tema, isto VAI pro Firestore (é identidade, não preferência do
// aparelho) — mas também aplica na hora, sem rascunho nem "Salvar": trocar de tom
// de pele sem ver o resultado no mesmo segundo não faz sentido. `setAvatar` já
// agenda o save.
//
// As cores dos botões vêm do catálogo (`domain/avatar.ts`) e por isso são inline:
// são conteúdo, como o sprite de um pet — não estilo do app. A regra do "cor é
// token" continua valendo pro CSS.

import { currentAvatarSprites, setAvatar } from '../../application/avatar';
import { AVATAR_FRAMES, HAIRS, HAIR_STYLES, SKINS } from '../../domain/avatar';
import type { RGB } from '../../domain/avatar';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';
import { useSpriteFrame } from '../profile/useSpriteFrame';

const t = strings.settings.avatar;
const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;

interface SwatchesProps {
  label: string;
  options: ReadonlyArray<{ id: string; name: string; base: RGB; shade: RGB }>;
  value: string;
  onPick: (id: string) => void;
}

function Swatches({ label, options, value, onPick }: SwatchesProps) {
  return (
    <div className="av-row" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          aria-label={o.name}
          title={o.name}
          data-swatch={o.id}
          className={'av-swatch' + (value === o.id ? ' selected' : '')}
          onClick={() => onPick(o.id)}
        >
          <span style={{ background: `linear-gradient(135deg, ${css(o.base)} 0 50%, ${css(o.shade)} 50% 100%)` }} />
        </button>
      ))}
    </div>
  );
}

export function AvatarPicker({ active }: { active: boolean }) {
  const avatar = useAppState((s) => s.avatar);
  const sprites = useAppState(() => currentAvatarSprites());
  // Só anima com a página aberta no Geral: um setInterval de 180 ms preso pra sempre
  // manteria o app re-renderizando com o preview escondido.
  const frame = useSpriteFrame(AVATAR_FRAMES, active);

  return (
    <div className="st-section">
      <div className="st-section-head"><div className="st-section-title">{t.title}</div></div>
      <div className="st-section-desc">{t.desc}</div>
      <div className="st-card av-card" id="avatar-picker">
        <div className="av-preview">
          <img id="avatar-preview" src={sprites[frame]} alt={t.previewAlt} />
        </div>
        <div className="av-controls">
          <div className="av-group">
            <div className="av-label">{t.skin}</div>
            <Swatches label={t.skin} options={SKINS} value={avatar.skin} onPick={(skin) => setAvatar({ skin })} />
          </div>
          <div className="av-group">
            <div className="av-label">{t.hair}</div>
            <Swatches label={t.hair} options={HAIRS} value={avatar.hair} onPick={(hair) => setAvatar({ hair })} />
          </div>
          <div className="av-group">
            <div className="av-label">{t.style}</div>
            <div className="av-row" role="radiogroup" aria-label={t.style}>
              {HAIR_STYLES.map((o) => (
                <button
                  type="button"
                  key={o.id}
                  role="radio"
                  aria-checked={avatar.style === o.id}
                  data-style={o.id}
                  className={'weekday-chip av-style' + (avatar.style === o.id ? ' selected' : '')}
                  onClick={() => setAvatar({ style: o.id })}
                >
                  {o.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="st-hint">{t.hint}</div>
      </div>
    </div>
  );
}
