// O que muda quando o app roda dentro do app nativo de iPhone. A UI pergunta aqui —
// componente não importa `infrastructure` (ver "Camadas em uma direção" no CLAUDE.md).

import { isNativeApp, isTestSite } from '../infrastructure/platform';

export { isNativeApp, isTestSite };
export { restartTestSite } from '../infrastructure/memory/testSite';
export type { TestAccountKind } from '../infrastructure/memory/testSite';

/** Onde o site está publicado. O projeto na Vercel se chama `plano-estudos` (não renomear). */
export const PUBLIC_APP_URL = 'https://plano-estudos-one.vercel.app';

export type LegalDoc = 'privacidade' | 'termos' | 'impressum';

/**
 * O endereço de um dos três documentos legais.
 *
 * No site é o caminho local de sempre. No app nativo é o endereço PUBLICADO: um link pra
 * outra origem o Capacitor abre no Safari, fora do app. O caminho local ali trocaria a
 * página do WebView pelo HTML estático — sem botão de voltar, e levando junto o timer,
 * que é runtime e não sobrevive a uma navegação.
 */
export function legalUrl(doc: LegalDoc): string {
  const path = `/legal/${doc}.html`;
  return isNativeApp() ? `${PUBLIC_APP_URL}${path}` : path;
}
