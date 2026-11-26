// O app de computador (Electron, `desktop/`) é o MESMO app web dentro de outra casca —
// como o de iPhone. Estes testes cobram o que dá pra cobrar sem abrir janela: as duas
// regras puras da casca (qual arquivo responde a um endereço, e o que pode sair pro
// navegador), a costura com o app (`isNativeApp`) e a configuração que, errada, só
// apareceria no instalador. A janela de verdade é `npm run test:desktop`.

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import capacitorConfig from '../capacitor.config';
import { PUBLIC_APP_URL, legalUrl } from '../src/application/platform';
import { isDesktopApp, isNativeApp } from '../src/infrastructure/platform';

interface AppPaths {
  APP_ORIGIN: string;
  resolveAppPath(root: string, urlPathname: string): string | null;
  isAppUrl(url: string): boolean;
  isExternalUrl(url: string): boolean;
}

const raiz = new URL('../', import.meta.url);
const ler = (caminho: string): string => readFileSync(new URL(caminho, raiz), 'utf8');
const json = <T>(caminho: string): T => JSON.parse(ler(caminho)) as T;

// A casca é CommonJS (o processo principal do Electron); o resto do projeto é ESM.
const { APP_ORIGIN, resolveAppPath, isAppUrl, isExternalUrl } = createRequire(import.meta.url)(
  '../desktop/app-paths.cjs',
) as AppPaths;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('qual arquivo responde a um endereço app://', () => {
  const ROOT = path.resolve('/app/web');
  const dentro = (...partes: string[]): string => path.join(ROOT, ...partes);

  it('a raiz e qualquer pasta respondem com o index.html delas', () => {
    expect(resolveAppPath(ROOT, '/')).toBe(dentro('index.html'));
    expect(resolveAppPath(ROOT, '/legal/')).toBe(dentro('legal', 'index.html'));
  });

  it('um arquivo do build responde com ele mesmo', () => {
    expect(resolveAppPath(ROOT, '/assets/index-abc.js')).toBe(dentro('assets', 'index-abc.js'));
    expect(resolveAppPath(ROOT, '/idle/pets/dog/0.png')).toBe(dentro('idle', 'pets', 'dog', '0.png'));
    expect(resolveAppPath(ROOT, '/fonts/DM%20Sans.woff2')).toBe(dentro('fonts', 'DM Sans.woff2'));
  });

  it('nenhum caminho sai da pasta do build — nem codificado, nem com barra do Windows', () => {
    for (const fuga of [
      '/../segredo.txt',
      '/../../etc/passwd',
      '/%2e%2e/%2e%2e/etc/passwd',
      '/assets/../../segredo.txt',
      '/..%2f..%2fsegredo.txt',
      '/..\\..\\segredo.txt',
      '/%2e%2e%5c%2e%2e%5csegredo.txt',
    ]) {
      const arquivo = resolveAppPath(ROOT, fuga);
      // Ou é recusado, ou foi normalizado pra DENTRO da pasta — nunca pra fora.
      if (arquivo !== null) expect(arquivo.startsWith(ROOT + path.sep)).toBe(true);
    }
    // Uma pasta vizinha com o mesmo prefixo no nome não conta como "dentro".
    expect(resolveAppPath(ROOT, '/../web-outro/x.js')).not.toBe(path.resolve('/app/web-outro/x.js'));
  });

  it('endereço quebrado é recusado, não vira exceção no processo principal', () => {
    expect(resolveAppPath(ROOT, '/%E0%A4%A')).toBeNull();
    expect(resolveAppPath(ROOT, '/a%00b')).toBeNull();
  });
});

describe('o que carrega na janela e o que sai pro navegador', () => {
  it('só a origem do próprio app carrega na janela', () => {
    expect(APP_ORIGIN).toBe('app://study-pets');
    expect(isAppUrl('app://study-pets/')).toBe(true);
    expect(isAppUrl('app://study-pets/index.html?tema=loft')).toBe(true);
    expect(isAppUrl('app://outro/')).toBe(false);
    expect(isAppUrl(`${PUBLIC_APP_URL}/`)).toBe(false);
    expect(isAppUrl('file:///C:/Windows/system.ini')).toBe(false);
    expect(isAppUrl('não é url')).toBe(false);
  });

  it('pro navegador do sistema só vai http(s) e mailto', () => {
    expect(isExternalUrl(`${PUBLIC_APP_URL}/legal/privacidade.html`)).toBe(true);
    expect(isExternalUrl('mailto:alguem@example.com')).toBe(true);
    for (const perigoso of [
      'file:///C:/Windows/System32/calc.exe',
      'javascript:alert(1)',
      'ms-settings:privacy',
      'app://study-pets/',
      'não é url',
    ]) {
      expect(isExternalUrl(perigoso)).toBe(false);
    }
  });
});

describe('a costura com o app', () => {
  /** Finge o preload: o Electron expõe este global antes de a página carregar. */
  const dentroDoDesktop = (): void => {
    vi.stubGlobal('studyPetsDesktop', { shell: 'desktop', platform: 'win32' });
  };

  it('no site não há casca: nem desktop, nem app', () => {
    expect(isDesktopApp()).toBe(false);
    expect(isNativeApp()).toBe(false);
  });

  it('dentro do Electron é o app de computador — e conta como app instalado', () => {
    dentroDoDesktop();
    expect(isDesktopApp()).toBe(true);
    expect(isNativeApp()).toBe(true);
  });

  it('o iPhone é app instalado, mas não é o de computador', () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    expect(isNativeApp()).toBe(true);
    expect(isDesktopApp()).toBe(false);
  });

  it('um global qualquer com esse nome não engana', () => {
    vi.stubGlobal('studyPetsDesktop', {});
    expect(isDesktopApp()).toBe(false);
    vi.stubGlobal('studyPetsDesktop', 'desktop');
    expect(isDesktopApp()).toBe(false);
  });

  it('os documentos legais apontam pro site publicado (a janela não navega pra fora do app)', () => {
    dentroDoDesktop();
    expect(legalUrl('termos')).toBe(`${PUBLIC_APP_URL}/legal/termos.html`);
    expect(isExternalUrl(legalUrl('termos'))).toBe(true);
  });

  it('o preload anuncia exatamente o que o app lê, e mais nada do Node', () => {
    const preload = ler('desktop/preload.cjs');
    expect(preload).toContain("exposeInMainWorld('studyPetsDesktop'");
    expect(preload).toContain("shell: 'desktop'");
    expect(preload).not.toMatch(/ipcRenderer|require\('node:|require\('fs'\)/);
  });
});

describe('a casca e o instalador', () => {
  interface DesktopPkg {
    main: string;
    devDependencies: Record<string, string>;
    build: {
      appId: string;
      productName: string;
      files: string[];
      extraResources: { from: string; to: string }[];
      win: { icon: string };
    };
  }
  interface RootPkg {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  }
  const desktop = json<DesktopPkg>('desktop/package.json');
  const root = json<RootPkg>('package.json');
  const main = ler('desktop/main.cjs');

  it('o Electron mora só em desktop/: o install da raiz (e o deploy da Vercel) não o baixa', () => {
    expect(Object.keys(desktop.devDependencies)).toEqual(expect.arrayContaining(['electron', 'electron-builder']));
    for (const deps of [root.dependencies, root.devDependencies]) {
      expect(Object.keys(deps).filter((d) => d.startsWith('electron'))).toEqual([]);
    }
    expect(root.scripts.build).toBe('vite build');
    expect(ler('vercel.json')).not.toContain('desktop');
  });

  it('o app instalado leva o MESMO build do iPhone (dist-native, sem service worker)', () => {
    expect(desktop.build.extraResources).toEqual([{ from: '../dist-native', to: 'web' }]);
    expect(capacitorConfig.webDir).toBe('dist-native');
    expect(main).toContain("path.join(process.resourcesPath, 'web')");
    expect(root.scripts.desktop).toContain('build:native');
    expect(root.scripts['desktop:dist']).toContain('build:native');
  });

  it('o id do app é o mesmo nas duas cascas', () => {
    expect(desktop.build.appId).toBe(capacitorConfig.appId);
    expect(main).toContain(`const APP_ID = '${capacitorConfig.appId}'`);
    expect(desktop.build.productName).toBe(capacitorConfig.appName);
  });

  it('todo arquivo que a casca carrega entra no pacote', () => {
    const locais = [...main.matchAll(/require\('\.\/([^']+)'\)/g)].map((m) => m[1]);
    expect(locais).toContain('app-paths.cjs');
    for (const arquivo of [desktop.main, 'preload.cjs', ...locais]) {
      expect(desktop.build.files).toContain(arquivo);
      expect(existsSync(new URL(`desktop/${arquivo}`, raiz))).toBe(true);
    }
    expect(existsSync(new URL(`desktop/${desktop.build.win.icon}`, raiz))).toBe(true);
  });

  it('a página roda isolada: sem Node, com sandbox', () => {
    expect(main).toContain('contextIsolation: true');
    expect(main).toContain('nodeIntegration: false');
    expect(main).toContain('sandbox: true');
    expect(main).not.toContain('webSecurity: false');
  });

  it('o relógio não é estrangulado em segundo plano — o motivo de a casca existir', () => {
    expect(main).toContain('backgroundThrottling: false');
  });

  it('o beforeunload do hardcore vira uma pergunta, não uma janela que não fecha', () => {
    expect(main).toContain("'will-prevent-unload'");
    expect(ler('src/infrastructure/unloadGuard.ts')).toContain('beforeunload');
  });

  it('a janela nasce no creme do Café de casa, como o app de iPhone', () => {
    expect(main).toContain(`const BG = '${capacitorConfig.backgroundColor}'`);
  });

  it('o que o build e o teste geram fica fora do git, e o smoke não tenta abrir o Electron', () => {
    const ignore = ler('.gitignore');
    expect(ignore).toContain('desktop/release/');
    expect(ignore).toContain('desktop/.web-teste/');
    expect(ler('playwright.config.ts')).toContain('testIgnore: /(extension|desktop)\\.spec\\.ts/');
    expect(root.scripts['test:desktop']).toBe('playwright test -c playwright.desktop.config.ts');
  });
});
