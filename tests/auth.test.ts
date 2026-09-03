import { describe, expect, it } from 'vitest';
import { authErrorReasonFromCode, isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from '../src/domain/auth';

describe('isValidEmail', () => {
  it('aceita formatos básicos válidos', () => {
    expect(isValidEmail('tomi@example.com')).toBe(true);
    expect(isValidEmail('  tomi@example.com  ')).toBe(true); // trim
    expect(isValidEmail('t.spielmann+study@tum.de')).toBe(true);
  });

  it('recusa formatos inválidos', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('sem-arroba')).toBe(false);
    expect(isValidEmail('sem-dominio@')).toBe(false);
    expect(isValidEmail('@sem-usuario.com')).toBe(false);
    expect(isValidEmail('espaço em@meio.com')).toBe(false);
  });
});

describe('isValidPassword', () => {
  it(`exige pelo menos ${MIN_PASSWORD_LENGTH} caracteres`, () => {
    expect(isValidPassword('1234567')).toBe(false);
    expect(isValidPassword('12345678')).toBe(true);
    expect(isValidPassword('umasenhabemlonga')).toBe(true);
  });
});

describe('authErrorReasonFromCode', () => {
  it('mapeia os códigos do Firebase pro motivo do domínio', () => {
    expect(authErrorReasonFromCode('auth/email-already-in-use')).toBe('email-in-use');
    expect(authErrorReasonFromCode('auth/invalid-credential')).toBe('invalid-credential');
    expect(authErrorReasonFromCode('auth/weak-password')).toBe('weak-password');
    expect(authErrorReasonFromCode('auth/invalid-email')).toBe('invalid-email');
    expect(authErrorReasonFromCode('auth/too-many-requests')).toBe('too-many-requests');
    expect(authErrorReasonFromCode('auth/network-request-failed')).toBe('network');
  });

  it('junta senha errada e e-mail inexistente (SDKs antigos) no mesmo motivo — nunca revela qual foi', () => {
    expect(authErrorReasonFromCode('auth/wrong-password')).toBe('invalid-credential');
    expect(authErrorReasonFromCode('auth/user-not-found')).toBe('invalid-credential');
  });

  it('código desconhecido ou ausente vira "unknown"', () => {
    expect(authErrorReasonFromCode('auth/algo-que-não-existe')).toBe('unknown');
    expect(authErrorReasonFromCode(undefined)).toBe('unknown');
  });
});
