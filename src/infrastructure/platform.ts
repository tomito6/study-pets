// Em que casca o app está rodando: o site (navegador ou PWA), o app nativo de iPhone
// (Capacitor — ver capacitor.config.ts e "App nativo (iPhone)" no CLAUDE.md) ou o app de
// computador (Electron — ver desktop/ e "App de computador (Windows)").
//
// As duas cascas se anunciam ANTES de a página carregar — a ponte nativa do Capacitor
// injeta `window.Capacitor`, e o preload do Electron expõe `window.studyPetsDesktop` —,
// então a pergunta é síncrona e vale desde a primeira linha do boot. Lê os globais em vez
// de importar `@capacitor/core` de propósito: no site os objetos simplesmente não existem,
// e nenhum byte de casca entra no bundle da Vercel só pra responder "não".

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

interface DesktopGlobal {
  shell?: string;
}

/** O app está rodando dentro do app de computador (a janela do Electron)? */
export function isDesktopApp(): boolean {
  const desk = (globalThis as { studyPetsDesktop?: DesktopGlobal }).studyPetsDesktop;
  return desk?.shell === 'desktop';
}

/**
 * O app está rodando dentro de um app instalado (iPhone ou computador), e não num
 * navegador? É a pergunta que separa as cascas do site: nelas o login por popup não
 * existe e um link pra fora sai da janela.
 */
export function isNativeApp(): boolean {
  if (isDesktopApp()) return true;
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  try {
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/**
 * O app está rodando no SITE DE TESTE — a prévia que a Vercel publica pra cada PR, em
 * modo memória (`vite build --mode previa`, ver `.env.previa`)? Não é o `dev:teste` nem
 * o e2e: esses continuam com uma conta nova por aba e sem etiqueta na tela.
 */
export function isTestSite(): boolean {
  return import.meta.env.VITE_TEST_SITE === '1';
}
