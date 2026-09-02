// Tela de entrada. Só aparece depois que o provedor de auth respondeu e ninguém
// está logado — antes disso a tela fica em branco, como o legado fazia.
// Mantém os mesmos ids/classes do markup antigo: o CSS e o smoke test dependem deles.

import { useEffect, useMemo, useState } from 'react';
import { signIn } from '../../application/session';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';

const SPRITE_FRAMES = 4;
const SPRITE_INTERVAL_MS = 180;
const STAR_COUNT = 30;

interface Star {
  left: string;
  top: string;
  duration: string;
  delay: string;
}

function makeStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, () => ({
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    duration: `${2 + Math.random() * 4}s`,
    delay: `${-Math.random() * 4}s`,
  }));
}

function Background() {
  const stars = useMemo(makeStars, []);
  return (
    <div className="ls-bg">
      <div className="ls-grid" />
      <div className="ls-glow" />
      <div className="ls-scanline" />
      {stars.map((s, i) => (
        <div
          key={i}
          className="ls-star"
          style={{ left: s.left, top: s.top, '--d': s.duration, '--delay': s.delay } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

function CharacterSprite() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPRITE_FRAMES), SPRITE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return (
    <img className="ls-char" src={`idle/user/${frame}.png`} alt={strings.login.charAlt} id="ls-char-sprite" />
  );
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function LoginScreen() {
  const { user, authReady } = useAppState((s, d) => ({ user: s.user, authReady: d.authReady }));
  if (!authReady || user) return null;

  const t = strings.login;
  return (
    <div id="login-screen">
      <Background />
      <div className="ls-content">
        <CharacterSprite />
        <div className="ls-eyebrow">{t.eyebrow}</div>
        <div className="ls-title">
          {t.title[0]}
          <br />
          <span>{t.title[1]}</span>
        </div>
        <div className="ls-sub">
          {t.sub[0]}
          <br />
          {t.sub[1]}
        </div>
        <div className="ls-features">
          {t.features.map((f) => (
            <div className="ls-feat" key={f.icon}>
              <span className="lf-icon">{f.icon}</span>
              {f.label[0]}
              <br />
              {f.label[1]}
            </div>
          ))}
        </div>
        <button className="ls-google-btn" onClick={() => void signIn()}>
          <GoogleLogo />
          {t.google}
        </button>
        <div className="ls-fine-print">{t.finePrint}</div>
      </div>
    </div>
  );
}
