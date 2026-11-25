// Em que casca o app está rodando: o site (navegador ou PWA) ou o app nativo de iPhone
// (Capacitor — ver capacitor.config.ts e "App nativo (iPhone)" no CLAUDE.md).
//
// A ponte nativa do Capacitor injeta `window.Capacitor` ANTES de a página carregar, então
// a pergunta é síncrona e vale desde a primeira linha do boot. Lê o global em vez de
// importar `@capacitor/core` de propósito: no site o objeto simplesmente não existe, e
// nenhum byte do Capacitor entra no bundle da Vercel só pra responder "não".

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

/** O app está rodando dentro do app nativo (e não num navegador)? */
export function isNativeApp(): boolean {
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  try {
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}
