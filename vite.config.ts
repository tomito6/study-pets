import { defineConfig } from 'vitest/config';

export default defineConfig({
  // index.html na raiz continua sendo o entry point.
  // Os sprites vivem em public/idle/ e são copiados pro dist como estão,
  // então os caminhos no código (`idle/user/0.png`) seguem valendo.
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    // Domínio é código puro: não precisa de DOM pra testar.
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // Ainda não há testes — eles chegam na Fase 3 (extração do domínio).
    passWithNoTests: true,
  },
});
