// Tela de entrada. Só aparece depois que o provedor de auth respondeu e ninguém
// está logado — antes disso a tela fica em branco, como o legado fazia.
// O visual Caderno mora nesta tela. As ações continuam em application/session.

import { useEffect, useState } from 'react';
import { resetPassword, signIn, signInWithEmail, signUpWithEmail } from '../../application/session';
import type { AuthErrorReason } from '../../domain/auth';
import { FORMS } from '../../domain/pets';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';
import { useSpriteFrame } from '../profile/useSpriteFrame';
import notebookScene from './notebook-scene.svg';

const PETS = [FORMS.cat!, FORMS.dog!, FORMS.cow!];

function LoginArtwork() {
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const frame = useSpriteFrame(PETS[1]!.frames, !reducedMotion);

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  return (
    <div className="ls-scene" aria-hidden="true">
      <img src={notebookScene} alt="" width="560" height="252" />
      <div className="ls-pets">
        {PETS.map((pet) => (
          <img key={pet.id} src={pet.sprite(reducedMotion ? 0 : frame % pet.frames)} alt="" width="32" height="32" />
        ))}
      </div>
    </div>
  );
}

function PawIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 15c4-7 8-7 12 0 5 9-6 3-6 3s-11 6-6-3Z" />
      <ellipse cx="4" cy="8" rx="2" ry="3" />
      <ellipse cx="10" cy="4" rx="2" ry="3" />
      <ellipse cx="16" cy="5" rx="2" ry="3" />
      <ellipse cx="21" cy="10" rx="2" ry="3" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
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
          aria-label={t.emailPlaceholder}
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          id="login-password"
          className="ls-input"
          placeholder={t.passwordPlaceholder}
          aria-label={t.passwordPlaceholder}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <div className="ls-error" id="login-error" role="alert">{t.errors[error]}</div>}
        {resetSent && <div className="ls-info" id="login-reset-sent" role="status">{t.resetSent(email)}</div>}
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

function LoginCard() {
  const t = strings.login;
  const [emailOpen, setEmailOpen] = useState(false);

  return (
    <section className="ls-card" aria-labelledby="login-title">
      <h2 id="login-title">{t.signIn}</h2>
      <div className="ls-actions">
        <button type="button" className="ls-option ls-google-btn" onClick={() => void signIn()}>
          <GoogleLogo />
          {t.google}
        </button>
        <button type="button" className="ls-option" id="login-email-option" aria-expanded={emailOpen} aria-controls="login-email-panel" onClick={() => setEmailOpen((open) => !open)}>
          <MailIcon />
          {t.email}
        </button>
      </div>
      <div id="login-email-panel" hidden={!emailOpen}>
        {emailOpen && <EmailForm />}
      </div>
      <nav className="ls-legal" aria-label={t.legalLabel}>
        <a href="/legal/privacidade.html">{t.legal.privacy}</a>
        <a href="/legal/termos.html">{t.legal.terms}</a>
        <a href="/legal/impressum.html">{t.legal.imprint}</a>
      </nav>
    </section>
  );
}

export function LoginScreen() {
  const { user, authReady } = useAppState((s, d) => ({ user: s.user, authReady: d.authReady }));
  if (!authReady || user) return null;

  const t = strings.login;
  return (
    <div id="login-screen" className="ls-notebook">
      <header className="ls-header">
        <PawIcon />
        <span>{strings.header.brand}</span>
      </header>
      <main className="ls-layout">
        <div className="ls-hero">
          <h1>{t.headline[0]} <em>{t.headline[1]}</em></h1>
          <LoginArtwork />
        </div>
        <LoginCard />
      </main>
    </div>
  );
}
