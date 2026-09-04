import { describe, expect, it, vi } from 'vitest';
import { TEST_USER, createMemoryAuth } from '../src/infrastructure/memory/auth';
import { createMemoryUserRepository } from '../src/infrastructure/memory/userRepository';
import type { KeyValueStorage } from '../src/infrastructure/memory/userRepository';
import { emptyPersistedState, serializeState } from '../src/domain/persistence';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Um sessionStorage de mentira — só o que o repositório usa. */
function fakeStorage(): KeyValueStorage & { dump(): Record<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

describe('auth em memória (modo teste)', () => {
  it('já começa logado no usuário de teste', async () => {
    const auth = createMemoryAuth();
    const cb = vi.fn();
    auth.onAuthStateChanged(cb);
    expect(cb).not.toHaveBeenCalled(); // assíncrono, como o Firebase
    await tick();
    expect(cb).toHaveBeenCalledWith(TEST_USER);
    expect(auth.currentUser()).toEqual(TEST_USER);
  });

  it('sair emite null e entrar emite o usuário de novo', async () => {
    const auth = createMemoryAuth();
    const cb = vi.fn();
    auth.onAuthStateChanged(cb);
    await tick();
    await auth.signOut();
    await tick();
    expect(cb).toHaveBeenLastCalledWith(null);
    expect(auth.currentUser()).toBeNull();
    await auth.signIn();
    await tick();
    expect(cb).toHaveBeenLastCalledWith(TEST_USER);
  });

  it('apagar a conta desloga', async () => {
    const auth = createMemoryAuth();
    const cb = vi.fn();
    auth.onAuthStateChanged(cb);
    await tick();
    await auth.deleteCurrentUser();
    await tick();
    expect(cb).toHaveBeenLastCalledWith(null);
  });

  it('cancelar a inscrição para de receber mudanças', async () => {
    const auth = createMemoryAuth();
    const cb = vi.fn();
    const off = auth.onAuthStateChanged(cb);
    await tick();
    off();
    await auth.signOut();
    await tick();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('auth em memória — e-mail e senha', () => {
  it('cria conta e já loga com provider "password"', async () => {
    const auth = createMemoryAuth();
    await auth.signUpWithEmail('nova@example.com', 'senhaboa123');
    const user = auth.currentUser();
    expect(user).not.toBeNull();
    expect(user?.email).toBe('nova@example.com');
    expect(user?.provider).toBe('password');
  });

  it('criar conta duas vezes com o mesmo e-mail dá email-in-use', async () => {
    const auth = createMemoryAuth();
    await auth.signUpWithEmail('duplicada@example.com', 'senhaboa123');
    await expect(auth.signUpWithEmail('duplicada@example.com', 'outrasenha1')).rejects.toMatchObject({
      name: 'AuthError',
      reason: 'email-in-use',
    });
  });

  it('e-mail é comparado sem diferenciar maiúsculas', async () => {
    const auth = createMemoryAuth();
    await auth.signUpWithEmail('Maiuscula@Example.com', 'senhaboa123');
    await expect(auth.signInWithEmail('maiuscula@example.com', 'senhaboa123')).resolves.toBeUndefined();
  });

  it('entrar com senha diferente da cadastrada dá invalid-credential', async () => {
    const auth = createMemoryAuth();
    await auth.signUpWithEmail('senha@example.com', 'senhacerta1');
    await expect(auth.signInWithEmail('senha@example.com', 'senhaerrada')).rejects.toMatchObject({
      name: 'AuthError',
      reason: 'invalid-credential',
    });
  });

  it('entrar com e-mail nunca cadastrado dá invalid-credential (não revela se existe)', async () => {
    const auth = createMemoryAuth();
    await expect(auth.signInWithEmail('ninguem@example.com', 'qualquersenha')).rejects.toMatchObject({
      name: 'AuthError',
      reason: 'invalid-credential',
    });
  });

  it('entrar com a senha certa loga a conta', async () => {
    const auth = createMemoryAuth();
    await auth.signUpWithEmail('login@example.com', 'senhacerta1');
    await auth.signOut();
    await auth.signInWithEmail('login@example.com', 'senhacerta1');
    expect(auth.currentUser()?.email).toBe('login@example.com');
  });

  it('contas diferentes recebem uids diferentes (documentos separados)', async () => {
    const auth = createMemoryAuth();
    await auth.signUpWithEmail('a@example.com', 'senhaboa123');
    const uidA = auth.currentUser()?.uid;
    await auth.signOut();
    await auth.signUpWithEmail('b@example.com', 'senhaboa123');
    const uidB = auth.currentUser()?.uid;
    expect(uidA).not.toBe(uidB);
  });

  it('reset de senha "envia" e resolve sem lançar', async () => {
    const auth = createMemoryAuth();
    await expect(auth.sendPasswordReset('qualquer@example.com')).resolves.toBeUndefined();
  });
});

describe('repositório em memória (modo teste)', () => {
  const doc = () => serializeState({ ...emptyPersistedState(), coinsSpent: 42 });

  it('é efêmero por definição', () => {
    expect(createMemoryUserRepository(null).ephemeral).toBe(true);
  });

  it('conta nova carrega null', async () => {
    expect(await createMemoryUserRepository(null).load('u1')).toBeNull();
  });

  it('salva e carrega de volta', async () => {
    const repo = createMemoryUserRepository(null);
    await repo.save('u1', doc());
    expect(await repo.load('u1')).toEqual(doc());
  });

  it('não vaza dados entre usuários', async () => {
    const repo = createMemoryUserRepository(null);
    await repo.save('u1', doc());
    expect(await repo.load('u2')).toBeNull();
  });

  it('devolve cópias — mexer no que carregou não altera o que está salvo', async () => {
    const repo = createMemoryUserRepository(null);
    await repo.save('u1', doc());
    const a = (await repo.load('u1')) as { coinsSpent: number };
    a.coinsSpent = 999;
    expect(((await repo.load('u1')) as { coinsSpent: number }).coinsSpent).toBe(42);
  });

  it('apagar remove o documento', async () => {
    const repo = createMemoryUserRepository(null);
    await repo.save('u1', doc());
    await repo.delete('u1');
    expect(await repo.load('u1')).toBeNull();
  });

  // Contrato compartilhado com o Firestore (setDoc SEM merge): salvar substitui o
  // documento inteiro. Um check desmarcado não pode voltar no reload.
  it('salvar substitui o doc inteiro — chave aninhada que sumiu não volta', async () => {
    const repo = createMemoryUserRepository(null);
    const base = emptyPersistedState();
    await repo.save('u1', serializeState({
      ...base,
      checks: { '2026-09-01': { '09:00': { pet: null, bonus: 0 }, '10:00': { pet: null, bonus: 0 } } },
      events: { '2026-09-01': [{ name: 'Aula', start: '14:00', end: '15:00', countsAsStudy: true }] },
    }));
    await repo.save('u1', serializeState({
      ...base,
      checks: { '2026-09-01': { '10:00': { pet: null, bonus: 0 } } },
    }));
    const loaded = (await repo.load('u1')) as { checks: Record<string, Record<string, unknown>>; events: Record<string, unknown> };
    expect(loaded.checks['2026-09-01']).toEqual({ '10:00': { pet: null, bonus: 0 } });
    expect(loaded.events).toEqual({});
  });

  it('subscribe é no-op: devolve um unsubscribe e nunca chama de volta', async () => {
    const repo = createMemoryUserRepository(null);
    const cb = vi.fn();
    const off = repo.subscribe('u1', cb);
    await repo.save('u1', doc());
    await tick();
    expect(cb).not.toHaveBeenCalled();
    expect(() => off()).not.toThrow();
  });

  it('campo legado que o app não manda mais some do doc salvo', async () => {
    const repo = createMemoryUserRepository(null);
    await repo.save('u1', { ...doc(), skills: { owl: 'noturno' } } as never);
    await repo.save('u1', doc());
    expect(await repo.load('u1')).not.toHaveProperty('skills');
  });
});

describe('repositório em memória com sessionStorage (sobrevive ao reload)', () => {
  const doc = () => serializeState({ ...emptyPersistedState(), coinsSpent: 7 });

  it('persiste no storage com prefixo próprio', async () => {
    const storage = fakeStorage();
    await createMemoryUserRepository(storage).save('u1', doc());
    expect(Object.keys(storage.dump())).toEqual(['study-pets:teste:u1']);
  });

  it('uma instância nova (como após reload) lê o que a anterior salvou', async () => {
    const storage = fakeStorage();
    await createMemoryUserRepository(storage).save('u1', doc());
    expect(await createMemoryUserRepository(storage).load('u1')).toEqual(doc());
  });

  it('apagar limpa o storage', async () => {
    const storage = fakeStorage();
    const repo = createMemoryUserRepository(storage);
    await repo.save('u1', doc());
    await repo.delete('u1');
    expect(storage.dump()).toEqual({});
    expect(await repo.load('u1')).toBeNull();
  });

  it('conteúdo corrompido no storage vira conta nova em vez de quebrar', async () => {
    const storage = fakeStorage();
    storage.setItem('study-pets:teste:u1', '{nao-e-json');
    expect(await createMemoryUserRepository(storage).load('u1')).toBeNull();
  });
});
