// O SITE DE TESTE: a prévia que a Vercel publica pra cada PR sobe em modo memória
// (`vite build --mode previa`), pra dar pra abrir o app e mexer sem terminal, sem login e
// sem encostar em conta de verdade. Estes testes cobram as costuras: quem escolhe o build,
// o que o build liga, e o que NÃO pode vazar pro `dev:teste`, pro e2e e pra produção.

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTestSite } from '../src/infrastructure/platform';
import { browserStorage, createMemoryUserRepository } from '../src/infrastructure/memory/userRepository';
import type { KeyValueStorage } from '../src/infrastructure/memory/userRepository';
import { emptyPersistedState, serializeState } from '../src/domain/persistence';

const raiz = new URL('../', import.meta.url);
const ler = (caminho: string): string => readFileSync(new URL(caminho, raiz), 'utf8');

/** As variáveis de um arquivo `.env`, sem os comentários. */
const variaveis = (caminho: string): Record<string, string> =>
  Object.fromEntries(
    ler(caminho)
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#'))
      .map((l) => l.split('=') as [string, string]),
  );

function fakeStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('quem escolhe o build na Vercel', () => {
  const vercel = JSON.parse(ler('vercel.json')) as { buildCommand: string; outputDirectory: string };
  const pkg = JSON.parse(ler('package.json')) as { scripts: Record<string, string> };

  it('a prévia de um PR builda o site de teste; produção builda o app de sempre', () => {
    expect(vercel.buildCommand).toBe(
      'if [ "$VERCEL_ENV" = "preview" ]; then npm run build:previa; else npm run build; fi',
    );
    expect(pkg.scripts['build:previa']).toBe('vite build --mode previa');
    // O build de produção não pode ter virado o de teste por engano.
    expect(pkg.scripts.build).toBe('vite build');
  });

  it('os dois saem na mesma pasta, que é a que a Vercel publica', () => {
    expect(vercel.outputDirectory).toBe('dist');
    expect(ler('vite.config.ts')).toContain(`native ? 'dist-native' : 'dist'`);
  });
});

describe('o que o modo previa liga', () => {
  it('modo memória e a marca de site de teste — e nenhuma config de Firebase', () => {
    expect(variaveis('.env.previa')).toEqual({ VITE_PERSISTENCE: 'memory', VITE_TEST_SITE: '1' });
  });

  it('o dev:teste (e o e2e, que roda em cima dele) continua sem a marca', () => {
    expect(variaveis('.env.teste')).toEqual({ VITE_PERSISTENCE: 'memory' });
  });

  it('o service worker do site de teste se desregistra em vez de precachear', () => {
    const vite = ler('vite.config.ts');
    expect(vite).toContain(`const previa = mode === 'previa';`);
    expect(vite).toContain('selfDestroying: previa,');
  });
});

describe('isTestSite', () => {
  it('fora do build de prévia, não', () => {
    expect(isTestSite()).toBe(false);
  });

  it('só com a variável do build de prévia', () => {
    vi.stubEnv('VITE_TEST_SITE', '1');
    expect(isTestSite()).toBe(true);
    vi.stubEnv('VITE_TEST_SITE', '0');
    expect(isTestSite()).toBe(false);
  });
});

describe('onde a conta de mentira fica guardada', () => {
  it('browserStorage devolve o storage pedido, e null quando ele não existe', () => {
    expect(browserStorage('local')).toBeNull(); // Node: sem localStorage
    const local = fakeStorage();
    const session = fakeStorage();
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
    expect(browserStorage('local')).toBe(local);
    expect(browserStorage('session')).toBe(session);
  });

  it('um storage que estoura ao usar (modo privado, iframe) vira null, não exceção', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(browserStorage('local')).toBeNull();
  });

  it('no site de teste duas abas dividem a mesma conta: a segunda não refaz o onboarding', async () => {
    const doNavegador = fakeStorage(); // o localStorage do endereço da prévia
    const aba1 = createMemoryUserRepository(doNavegador);
    const doc = serializeState({ ...emptyPersistedState(), coinsSpent: 150 });
    await aba1.save('usuario-teste', doc);

    const aba2 = createMemoryUserRepository(doNavegador);
    expect(await aba2.load('usuario-teste')).toEqual(doc);

    // E apagar a conta numa aba apaga pra valer: a próxima visita começa do zero.
    await aba2.delete('usuario-teste');
    expect(await aba1.load('usuario-teste')).toBeNull();
  });
});
