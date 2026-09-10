// Os controles do personagem: preview animado + tom de pele, cor de cabelo,
// penteado e corpo.
//
// É **controlado** — quem usa decide onde a escolha mora. Nas Configurações ela
// vai direto pro store (`setAvatar` salva na hora); no onboarding ela fica num
// `useState` e só é aplicada no fim, porque salvar antes de o onboarding
// terminar criaria o documento e um reload pularia o pet inicial.
//
// As cores dos botões são inline porque vêm do catálogo: são conteúdo, como o
// sprite de um pet. A regra do "cor é token" continua valendo pro CSS.

import { avatarSpritesOf } from '../../application/avatar';
import { AVATAR_FRAMES, BODIES, HAIRS, HAIR_STYLES, SKINS } from '../../domain/avatar';
import type { AvatarConfig, RGB } from '../../domain/avatar';
import { strings } from '../../shared/strings';
import { useSpriteFrame } from '../profile/useSpriteFrame';

const t = strings.settings.avatar;
const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;

function Swatches({ label, options, value, onPick }: {
  label: string;
  options: ReadonlyArray<{ id: string; name: string; base: RGB; shade: RGB }>;
  value: string;
  onPick: (id: string) => void;
}) {
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

function Pills({ label, options, value, attr, onPick }: {
  label: string;
  options: ReadonlyArray<{ id: string; name: string }>;
  value: string;
  attr: 'data-style' | 'data-body';
  onPick: (id: string) => void;
}) {
  return (
    <div className="av-row" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          {...({ [attr]: o.id } as Record<string, string>)}
          className={'weekday-chip av-style' + (value === o.id ? ' selected' : '')}
          onClick={() => onPick(o.id)}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

export function AvatarControls({ value, onChange, active, previewId = 'avatar-preview' }: {
  value: AvatarConfig;
  onChange: (patch: Partial<AvatarConfig>) => void;
  /** Só anima com a tela visível: um setInterval preso pra sempre re-renderizaria à toa. */
  active: boolean;
  previewId?: string;
}) {
  const sprites = avatarSpritesOf(value);
  const frame = useSpriteFrame(AVATAR_FRAMES, active);
  return (
    <>
      <div className="av-preview">
        <img id={previewId} src={sprites[frame]} alt={t.previewAlt} />
      </div>
      <div className="av-controls">
        <div className="av-group">
          <div className="av-label">{t.skin}</div>
          <Swatches label={t.skin} options={SKINS} value={value.skin} onPick={(skin) => onChange({ skin })} />
        </div>
        <div className="av-group">
          <div className="av-label">{t.hair}</div>
          <Swatches label={t.hair} options={HAIRS} value={value.hair} onPick={(hair) => onChange({ hair })} />
        </div>
        <div className="av-group">
          <div className="av-label">{t.style}</div>
          <Pills label={t.style} options={HAIR_STYLES} value={value.style} attr="data-style" onPick={(style) => onChange({ style })} />
        </div>
        <div className="av-group">
          <div className="av-label">{t.body}</div>
          <Pills label={t.body} options={BODIES} value={value.body} attr="data-body" onPick={(body) => onChange({ body })} />
        </div>
      </div>
    </>
  );
}
