import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `--mode native` é o build que vai DENTRO do app de iPhone (Capacitor, ver
// capacitor.config.ts e "App nativo" no CLAUDE.md). Duas diferenças, e só duas:
// sai em `dist-native/` (o `dist/` continua sendo o da Vercel, intocado) e não leva
// service worker — o WebView do iOS serve os arquivos do próprio pacote do app, então
// não há rede pra cachear, e um SW ali só criaria uma segunda cópia de tudo que podia
// ficar velha em relação ao app instalado.
//
// `--mode previa` é o SITE DE TESTE: o que a Vercel publica na prévia de cada PR (ver
// vercel.json e "O site de teste" no CLAUDE.md). É o modo memória do `dev:teste`, só que
// buildado — as variáveis vêm do `.env.previa`. A única diferença aqui é o service worker,
// que nasce "autodestrutivo" (ver `selfDestroying` abaixo).
export default defineConfig(({ mode }) => {
  const native = mode === 'native';
  const previa = mode === 'previa';
  return {
    plugins: [
      react(),
      // PWA: o service worker (workbox) só existe no build — em dev/teste nada é registrado,
      // então HMR e e2e continuam iguais. A navegação é servida do PRECACHE (navigateFallback
      // aponta pro index.html precacheado, e runtimeCaching está vazio): abre offline, mas não
      // busca a rede primeiro. Quem faz o deploy novo aparecer é o registerType 'autoUpdate' —
      // o SW novo assume assim que instala, e o reload seguinte já pega o precache novo. Nada de
      // runtime caching pra Google/Firebase: auth e Firestore falam direto com a rede
      // (o Firestore tem o cache dele em IndexedDB).
      !native && VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        // No site de teste o SW se desregistra e apaga os caches em vez de precachear.
        // Um link de teste tem que mostrar o último push no PRIMEIRO carregamento — o
        // precache mostraria o deploy anterior até o reload seguinte. E não basta não
        // gerar SW nenhum: o endereço da prévia de um PR antigo já pode ter um SW do
        // build com Firebase instalado no navegador, e ele continuaria servindo aquele
        // build pra sempre. O autodestrutivo é o que tira o antigo de lá.
        selfDestroying: previa,
        // O manifest é o arquivo estático em public/manifest.webmanifest (index.html aponta pra ele).
        manifest: false,
        includeAssets: ['icons/*.png', 'manifest.webmanifest'],
        devOptions: { enabled: false },
        workbox: {
          navigateFallback: '/index.html',
          // As páginas legais são HTML de verdade, não rotas do app: o fallback não pode
          // engoli-las. Sem isto, /legal/privacidade.html abriria o Study Pets — inclusive
          // pro console do Google, que precisa da URL da política respondendo de verdade.
          navigateFallbackDenylist: [/^\/legal\//],
          // woff2 entra: as fontes agora são nossas (public/fonts/), e sem elas no
          // precache o app abriria offline com a tipografia do sistema.
          globPatterns: ['**/*.{js,css,html,png,webmanifest,woff2}'],
          runtimeCaching: [],
        },
      }),
    ],
    // index.html na raiz continua sendo o entry point.
    // Os sprites vivem em public/idle/ e são copiados pro dist como estão,
    // então os caminhos no código (`idle/user/0.png`) seguem valendo.
    build: {
      outDir: native ? 'dist-native' : 'dist',
      emptyOutDir: true,
      // Firebase e React mudam raramente: em chunks próprios, o cache do browser segura
      // eles entre deploys e só o código do app é baixado de novo.
      rollupOptions: {
        output: {
          // Vite 8 (rolldown) só aceita a forma de função.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            const pkg = id.split('node_modules').pop()!.slice(1); // tira o separador, em qualquer SO
            if (pkg.startsWith('firebase') || pkg.startsWith('@firebase')) return 'firebase';
            if (pkg.startsWith('react') || pkg.startsWith('scheduler')) return 'react';
            return undefined;
          },
        },
      },
    },
    test: {
      // Domínio é código puro: não precisa de DOM pra testar.
      environment: 'node',
      include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
      // Os testes chegaram (tests/ e src/**/*.test.ts). `passWithNoTests` fica pra
      // rodar um filtro (`npm test -- -t algo`) sem que zero casamentos vire erro.
      passWithNoTests: true,
    },
  };
});
