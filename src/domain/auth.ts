// Regras puras de autenticação por e-mail/senha: validação e o motivo por trás
// de cada erro. Não sabe nada de Firebase — só interpreta os códigos que a
// porta lhe entrega como string.

export const MIN_PASSWORD_LENGTH = 8;

export type AuthErrorReason =
  | 'email-in-use'
  | 'invalid-credential'
  | 'weak-password'
  | 'invalid-email'
  | 'too-many-requests'
  | 'network'
  | 'unknown';

export class AuthError extends Error {
  constructor(
    public readonly reason: AuthErrorReason,
    public override readonly cause?: unknown,
  ) {
    super(`auth error: ${reason}`);
    this.name = 'AuthError';
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export function isValidPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

// Mapa de códigos do Firebase Auth pro motivo do domínio. Propositalmente
// junta `auth/wrong-password`/`auth/user-not-found` (SDKs antigos) e
// `auth/invalid-credential` (SDKs novos, que já não distingue os dois) no
// mesmo motivo — nunca revelar se foi a senha ou o e-mail que errou.
const FIREBASE_ERROR_MAP: Record<string, AuthErrorReason> = {
  'auth/email-already-in-use': 'email-in-use',
  'auth/invalid-credential': 'invalid-credential',
  'auth/wrong-password': 'invalid-credential',
  'auth/user-not-found': 'invalid-credential',
  'auth/weak-password': 'weak-password',
  'auth/invalid-email': 'invalid-email',
  'auth/too-many-requests': 'too-many-requests',
  'auth/network-request-failed': 'network',
};

export function authErrorReasonFromCode(code: string | undefined): AuthErrorReason {
  if (!code) return 'unknown';
  return FIREBASE_ERROR_MAP[code] ?? 'unknown';
}
