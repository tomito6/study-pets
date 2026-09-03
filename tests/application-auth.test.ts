// Casos de uso de autenticação por e-mail/senha (src/application/session.ts) e a
// reautenticação por senha no apagar conta (src/application/account.ts), rodando
// sobre a infra em memória — nunca toca o Firebase de verdade.

import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAccount } from '../src/application/account';
import { resetPassword, signInWithEmail, signOut, signUpWithEmail } from '../src/application/session';
import { SCHEMA_VERSION, emptyPersistedState } from '../src/domain/persistence';
import { auth, users } from '../src/infrastructure';
import { state } from '../src/store/store';

beforeEach(async () => {
  Object.assign(state, emptyPersistedState());
  await signOut();
});

describe('signUpWithEmail', () => {
  it('cria a conta e loga', async () => {
    const r = await signUpWithEmail('gente@example.com', 'senhaboa123');
    expect(r).toEqual({ ok: true });
    expect(auth.currentUser()?.email).toBe('gente@example.com');
    expect(auth.currentUser()?.provider).toBe('password');
  });

  it('recusa e-mail com formato inválido antes de tocar a infra', async () => {
    const r = await signUpWithEmail('nao-e-email', 'senhaboa123');
    expect(r).toEqual({ ok: false, reason: 'invalid-email' });
    expect(auth.currentUser()).toBeNull();
  });

  it('recusa senha curta antes de tocar a infra (Firebase aceitaria 6; a gente pede 8)', async () => {
    const r = await signUpWithEmail('senhacurta@example.com', '1234567');
    expect(r).toEqual({ ok: false, reason: 'weak-password' });
    expect(auth.currentUser()).toBeNull();
  });

  it('e-mail já cadastrado devolve o motivo da infra', async () => {
    await signUpWithEmail('repetido@example.com', 'senhaboa123');
    await signOut();
    const r = await signUpWithEmail('repetido@example.com', 'outrasenha1');
    expect(r).toEqual({ ok: false, reason: 'email-in-use' });
  });
});

describe('signInWithEmail', () => {
  it('entra com a senha certa', async () => {
    await signUpWithEmail('entrar@example.com', 'senhacerta1');
    await signOut();
    const r = await signInWithEmail('entrar@example.com', 'senhacerta1');
    expect(r).toEqual({ ok: true });
    expect(auth.currentUser()?.email).toBe('entrar@example.com');
  });

  it('senha errada devolve invalid-credential, sem revelar qual campo errou', async () => {
    await signUpWithEmail('senha2@example.com', 'senhacerta1');
    await signOut();
    const r = await signInWithEmail('senha2@example.com', 'senhaerrada');
    expect(r).toEqual({ ok: false, reason: 'invalid-credential' });
  });
});

describe('resetPassword', () => {
  it('e-mail com formato válido sempre resolve ok — mesmo sem conta cadastrada', async () => {
    const r = await resetPassword('ninguem-tem-essa-conta@example.com');
    expect(r).toEqual({ ok: true });
  });

  it('e-mail com formato inválido é recusado antes de chamar a infra', async () => {
    const r = await resetPassword('isso-nem-e-email');
    expect(r).toEqual({ ok: false, reason: 'invalid-email' });
  });
});

describe('deleteAccount com reautenticação por senha', () => {
  it('conta de e-mail/senha apaga normalmente passando a senha adiante', async () => {
    await signUpWithEmail('apagar@example.com', 'senhacerta1');
    const uid = auth.currentUser()!.uid;
    state.user = auth.currentUser();
    await users.save(uid, { ...emptyPersistedState(), config: state.config, schemaVersion: SCHEMA_VERSION });

    const stages: string[] = [];
    const r = await deleteAccount((s) => stages.push(s), 'senhacerta1');
    expect(r).toBe('ok');
    expect(stages).toEqual(['deleting']);
    expect(await users.load(uid)).toBeNull();
    expect(auth.currentUser()).toBeNull();
  });
});
