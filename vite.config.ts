import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // PWA: o service worker (workbox) só existe no build — em dev/teste nada é registrado,
    // então HMR e e2e continuam iguais. Navegação é network-first com fallback ao cache
    // (deploy novo aparece no próximo reload); assets do dist são precache. Nada de
    // runtime caching pra Google/Firebase: auth e Firestore falam direto com a rede
    // (o Firestore tem o cache dele em IndexedDB).
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // O manifest é o arquivo estático em public/manifest.webmanifest (index.html aponta pra ele).
      manifest: false,
      includeAssets: ['icons/*.png', 'manifest.webmanifest'],
      devOptions: { enabled: false },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
        runtimeCaching: [],
      },
    }),
  ],
  // index.html na raiz continua sendo o entry point.
  // Os sprites vivem em public/idle/ e são copiados pro dist como estão,
  // então os caminhos no código (`idle/user/0.png`) seguem valendo.
  build: {
    outDir: 'dist',
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
    // Ainda não há testes — eles chegam na Fase 3 (extração do domínio).
    passWithNoTests: true,
  },
});
