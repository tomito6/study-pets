// O app de iPhone (Capacitor): o MESMO app web, servido de dentro do pacote nativo.
// Ver "App nativo (iPhone)" no CLAUDE.md e plans/2026-11-25_1900_app-nativo-iphone.md.
//
//   npm run ios:sync   → builda o web em dist-native/ e copia pro projeto em ios/
//   npm run ios:open   → abre o projeto no Xcode (só num Mac)

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // O identificador do app na Apple. Não aparece pra ninguém, mas depois da primeira
  // subida pro TestFlight/App Store NÃO MUDA MAIS — é a decisão a conferir antes dela.
  appId: 'app.studypets',
  appName: 'Study Pets',
  // O build `--mode native` (sem service worker). Nunca `dist/`, que é o da Vercel.
  webDir: 'dist-native',
  // O creme do Café de casa, o tema padrão: é o que aparece atrás da página enquanto
  // ela carrega e nas faixas da área segura (relógio, barra de gesto).
  backgroundColor: '#f6efe3',
  ios: {
    // A página fica DENTRO da área segura (abaixo do relógio/entalhe, acima da barra de
    // gesto) sem que o CSS precise saber de `env(safe-area-inset-*)`. É a escolha que não
    // mexe em geometria nenhuma do app; a alternativa (viewport-fit=cover + padding em
    // cada elemento fixo) fica pra quando houver aparelho pra medir.
    contentInset: 'always',
  },
};

export default config;
