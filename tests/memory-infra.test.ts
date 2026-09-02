import { describe, expect, it, vi } from 'vitest';
import { TEST_USER, createMemoryAuth } from '../src/infrastructure/memory/auth';
import { createMemoryUserRepository } from '../src/infrastructure/memory/userRepository';
import { emptyPersistedState, serializeState } from '../src/domain/persistence';

const tick = () => new Promise((r) => setTimeout(r, 0));

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

describe('repositório em memória (modo teste)', () => {
  const doc = () => serializeState({ ...emptyPersistedState(), coinsSpent: 42 });

  it('é efêmero por definição', () => {
    expect(createMemoryUserRepository().ephemeral).toBe(true);
  });

  it('conta nova carrega null', async () => {
    expect(await createMemoryUserRepository().load('u1')).toBeNull();
  });

  it('salva e carrega de volta', async () => {
    const repo = createMemoryUserRepository();
    await repo.save('u1', doc());
    expect(await repo.load('u1')).toEqual(doc());
  });

  it('não vaza dados entre usuários', async () => {
    const repo = createMemoryUserRepository();
    await repo.save('u1', doc());
    expect(await repo.load('u2')).toBeNull();
  });

  it('devolve cópias — mexer no que carregou não altera o que está salvo', async () => {
    const repo = createMemoryUserRepository();
    await repo.save('u1', doc());
    const a = (await repo.load('u1')) as { coinsSpent: number };
    a.coinsSpent = 999;
    expect(((await repo.load('u1')) as { coinsSpent: number }).coinsSpent).toBe(42);
  });

  it('apagar remove o documento', async () => {
    const repo = createMemoryUserRepository();
    await repo.save('u1', doc());
    await repo.delete('u1');
    expect(await repo.load('u1')).toBeNull();
  });
});
