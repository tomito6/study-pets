// O app nativo de iPhone (Capacitor) é o MESMO app web dentro de outra casca. Estes
// testes cobram as costuras entre as duas — o que o app faz diferente quando está lá
// dentro — e o que o projeto iOS versionado precisa ter pra não ser recusado pela Apple.
// Nenhum deles roda num iPhone: o que só um aparelho prova está listado em
// plans/2026-11-25_1900_app-nativo-iphone.md.

import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import capacitorConfig from '../capacitor.config';
import { PUBLIC_APP_URL, legalUrl } from '../src/application/platform';
import { isNativeApp } from '../src/infrastructure/platform';

const raiz = new URL('../', import.meta.url);
const ler = (caminho: string): string => readFileSync(new URL(caminho, raiz), 'utf8');

/** Finge a ponte nativa: o Capacitor injeta este global antes de a página carregar. */
const dentroDoApp = (nativo = true): void => {
  vi.stubGlobal('Capacitor', { isNativePlatform: () => nativo });
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock('firebase/auth');
});

describe('em que casca o app está', () => {
  it('no site não há ponte nativa: não é app', () => {
    expect(isNativeApp()).toBe(false);
  });

  it('com a ponte do Capacitor dizendo que é nativo, é', () => {
    dentroDoApp();
    expect(isNativeApp()).toBe(true);
  });

  it('o Capacitor carregado num NAVEGADOR (plugin com versão web) não conta como app', () => {
    dentroDoApp(false);
    expect(isNativeApp()).toBe(false);
  });

  it('uma ponte quebrada cai no site, nunca num erro no boot', () => {
    vi.stubGlobal('Capacitor', {
      isNativePlatform: () => {
        throw new Error('ponte quebrada');
      },
    });
    expect(isNativeApp()).toBe(false);
    vi.stubGlobal('Capacitor', {});
    expect(isNativeApp()).toBe(false);
  });
});

describe('os documentos legais nas duas cascas', () => {
  const DOCS = ['privacidade', 'termos', 'impressum'] as const;

  it('no site é o caminho local, e o arquivo existe', () => {
    for (const doc of DOCS) {
      expect(legalUrl(doc)).toBe(`/legal/${doc}.html`);
      expect(existsSync(new URL(`public${legalUrl(doc)}`, raiz))).toBe(true);
    }
  });

  it('no app nativo é o endereço publicado — outra origem, que o iOS abre no Safari', () => {
    dentroDoApp();
    for (const doc of DOCS) {
      expect(legalUrl(doc)).toBe(`${PUBLIC_APP_URL}/legal/${doc}.html`);
      expect(new URL(legalUrl(doc)).protocol).toBe('https:');
    }
  });

  it('nenhuma tela escreve o caminho local direto (ele prenderia o app nativo numa página sem volta)', () => {
    for (const tela of [
      'src/features/auth/LoginScreen.tsx',
      'src/features/onboarding/OnboardingModal.tsx',
      'src/features/settings/SettingsPage.tsx',
    ]) {
      expect(ler(tela), tela).not.toMatch(/href=["'{`]+\/legal\//);
    }
  });
});

describe('o login dentro do app nativo', () => {
  /** Um `firebase/auth` de mentira que só anota quem foi chamado. */
  function firebaseAuthFalso() {
    const chamadas: string[] = [];
    const anota = (nome: string) => (..._args: unknown[]) => {
      chamadas.push(nome);
      return { currentUser: null };
    };
    vi.doMock('firebase/auth', () => ({
      EmailAuthProvider: { credential: anota('credential') },
      GoogleAuthProvider: class {},
      createUserWithEmailAndPassword: anota('createUserWithEmailAndPassword'),
      deleteUser: anota('deleteUser'),
      getAuth: anota('getAuth'),
      indexedDBLocalPersistence: { type: 'LOCAL' },
      initializeAuth: anota('initializeAuth'),
      onAuthStateChanged: anota('onAuthStateChanged'),
      reauthenticateWithCredential: anota('reauthenticateWithCredential'),
      reauthenticateWithPopup: anota('reauthenticateWithPopup'),
      sendEmailVerification: anota('sendEmailVerification'),
      sendPasswordResetEmail: anota('sendPasswordResetEmail'),
      signInWithEmailAndPassword: anota('signInWithEmailAndPassword'),
      signInWithPopup: anota('signInWithPopup'),
      signOut: anota('signOut'),
    }));
    return chamadas;
  }

  it('no site o auth é o de sempre, e o Google entra por popup', async () => {
    const chamadas = firebaseAuthFalso();
    const { createFirebaseAuth } = await import('../src/infrastructure/firebase/auth');
    const auth = createFirebaseAuth({} as never);
    expect(chamadas).toEqual(['getAuth']);
    await auth.signIn();
    expect(chamadas).toContain('signInWithPopup');
  });

  it('no app o auth nasce sem a maquinaria de popup (que trava o WebView do iOS)', async () => {
    dentroDoApp();
    const chamadas = firebaseAuthFalso();
    const { createFirebaseAuth } = await import('../src/infrastructure/firebase/auth');
    createFirebaseAuth({} as never);
    expect(chamadas).toEqual(['initializeAuth']);
  });

  it('no app o Google recusa em vez de tentar um popup que não existe; e-mail e senha seguem', async () => {
    dentroDoApp();
    const chamadas = firebaseAuthFalso();
    const { createFirebaseAuth } = await import('../src/infrastructure/firebase/auth');
    const auth = createFirebaseAuth({} as never);
    await expect(auth.signIn()).rejects.toThrow();
    expect(chamadas).not.toContain('signInWithPopup');
    await auth.signInWithEmail('a@b.co', 'senha-de-teste');
    expect(chamadas).toContain('signInWithEmailAndPassword');
  });

  it('a tela de login troca o botão do Google por uma frase, só no app', () => {
    const login = ler('src/features/auth/LoginScreen.tsx');
    expect(login).toContain('isNativeApp()');
    expect(login).toContain('login-google-soon');
  });
});

describe('o build que vai dentro do app', () => {
  const pkg = JSON.parse(ler('package.json')) as { scripts: Record<string, string> };
  const vite = ler('vite.config.ts');

  it('sai numa pasta própria, que é a que o Capacitor copia — nunca o dist da Vercel', () => {
    expect(capacitorConfig.webDir).toBe('dist-native');
    expect(vite).toContain(`native ? '${capacitorConfig.webDir}' : 'dist'`);
    expect(JSON.parse(ler('vercel.json')).outputDirectory).toBe('dist');
    expect(ler('.gitignore')).toContain(`${capacitorConfig.webDir}/`);
  });

  it('é o modo native do Vite, e sincronizar sempre builda antes', () => {
    expect(pkg.scripts['build:native']).toBe('vite build --mode native');
    expect(pkg.scripts['ios:sync']).toMatch(/^npm run build:native && cap sync ios$/);
    // O build da Vercel não pode ter virado o nativo por engano.
    expect(pkg.scripts.build).toBe('vite build');
  });

  it('não leva service worker: o app serve os arquivos do próprio pacote', () => {
    expect(vite).toMatch(/!native && VitePWA\(/);
  });
});

describe('o projeto iOS versionado', () => {
  const pbx = ler('ios/App/App.xcodeproj/project.pbxproj');
  const plist = ler('ios/App/App/Info.plist');

  it('tem o mesmo identificador e o mesmo nome da config do Capacitor', () => {
    const ids = [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).toBe(capacitorConfig.appId);
    expect(plist).toContain(`<string>${capacitorConfig.appName}</string>`);
  });

  it('no iPhone só fica em pé, como o manifest do PWA', () => {
    const iphone = /<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)?.[1] ?? '';
    expect(iphone).toContain('UIInterfaceOrientationPortrait');
    expect(iphone).not.toContain('Landscape');
    expect(JSON.parse(ler('public/manifest.webmanifest')).orientation).toBe('portrait');
  });

  /** Largura, altura e tipo de cor de um PNG, lidos do cabeçalho IHDR. */
  const png = (caminho: string) => {
    const b = readFileSync(new URL(caminho, raiz));
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
  };

  it('o ícone é 1024×1024 e SEM canal alfa — a App Store recusa ícone com alfa', () => {
    const icone = png('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
    expect(icone).toEqual({ w: 1024, h: 1024, colorType: 2 }); // 2 = RGB; 6 seria RGBA
  });

  it('a tela de abertura tem as três escalas que o Xcode pede, e sai do mesmo script do ícone', () => {
    const contents = JSON.parse(ler('ios/App/App/Assets.xcassets/Splash.imageset/Contents.json')) as {
      images: { filename: string }[];
    };
    expect(contents.images).toHaveLength(3);
    const script = ler('scripts/app-icon.mjs');
    for (const { filename } of contents.images) {
      expect(png(`ios/App/App/Assets.xcassets/Splash.imageset/${filename}`).colorType).toBe(2);
      expect(script).toContain(filename);
    }
  });
});
