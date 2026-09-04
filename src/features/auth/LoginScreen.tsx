// Tela de entrada. Só aparece depois que o provedor de auth respondeu e ninguém
// está logado — antes disso a tela fica em branco, como o legado fazia.
// Mantém os mesmos ids/classes do markup antigo: o CSS e o smoke test dependem deles.

import { useEffect, useMemo, useState } from 'react';
import { resetPassword, signIn, signInWithEmail, signUpWithEmail } from '../../application/session';
import type { AuthErrorReason } from '../../domain/auth';
import { FORMS } from '../../domain/pets';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';

/** O mascote da tela de entrada: o cachorro, não o personagem. */
const MASCOT = FORMS.dog!;
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

function MascotSprite() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % MASCOT.frames), SPRITE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return (
    <img className="ls-char" src={MASCOT.sprite(frame)} alt={MASCOT.name} id="ls-char-sprite" />
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

type Mode = 'signin' | 'signup';

function EmailForm() {
  const t = strings.login;
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<AuthErrorReason | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const clearFeedback = () => {
    setError(null);
    setResetSent(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setBusy(true);
    const result = mode === 'signup' ? await signUpWithEmail(email, password) : await signInWithEmail(email, password);
    setBusy(false);
    if (!result.ok) setError(result.reason);
  };

  const forgotPassword = async () => {
    clearFeedback();
    setBusy(true);
    const result = await resetPassword(email);
    setBusy(false);
    if (!result.ok) setError(result.reason);
    else setResetSent(true);
  };

  const toggleMode = () => {
    clearFeedback();
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
  };

  return (
    <>
      <form className="ls-form" id="login-form" onSubmit={(e) => void submit(e)}>
        <input
          type="email"
          id="login-email"
          className="ls-input"
          placeholder={t.emailPlaceholder}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          id="login-password"
          className="ls-input"
          placeholder={t.passwordPlaceholder}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <div className="ls-error" id="login-error">{t.errors[error]}</div>}
        {resetSent && <div className="ls-info" id="login-reset-sent">{t.resetSent(email)}</div>}
        <button type="submit" className="ls-submit-btn" id="login-submit" disabled={busy}>
          {busy ? t.loading : mode === 'signup' ? t.signUp : t.signIn}
        </button>
      </form>
      <div className="ls-links">
        <button type="button" className="ls-link" id="login-toggle-mode" onClick={toggleMode}>
          {mode === 'signup' ? t.haveAccount : t.needAccount}
        </button>
        <button type="button" className="ls-link" id="login-forgot" onClick={() => void forgotPassword()}>
          {t.forgotPassword}
        </button>
      </div>
    </>
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
        <MascotSprite />
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
        <EmailForm />
        <div className="ls-divider"><span>{t.or}</span></div>
        <button className="ls-google-btn" onClick={() => void signIn()}>
          <GoogleLogo />
          {t.google}
        </button>
        <div className="ls-fine-print">{t.finePrint}</div>
      </div>
    </div>
  );
}
