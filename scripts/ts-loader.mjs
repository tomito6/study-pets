// Resolve imports sem extensão (`./time` → `./time.ts`) pra scripts do Node poderem
// importar o domínio direto, sem build. O Vite faz isso sozinho no app; aqui não há Vite.
//
//   node --import ./scripts/ts-loader.mjs scripts/<algo>.mjs
//
// O Node 24 já tira os tipos do TypeScript sozinho — só a resolução faltava.

import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CANDIDATES = ['.ts', '.tsx', '/index.ts'];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const base = new URL(specifier, context.parentURL);
      for (const ext of CANDIDATES) {
        const url = new URL(base.href + ext);
        if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});
