// Gera o build que o teste do app de computador abre: o mesmo `build:native` (sem
// service worker), mas em modo memória — sem Firebase e sem rede, como o `dev:teste`.
// Pela API do Vite em vez de um script do package.json porque variável de ambiente
// na linha de comando não é a mesma coisa no Windows e no Linux.

import { fileURLToPath } from 'node:url';
import { build } from 'vite';

export const WEB_TESTE = fileURLToPath(new URL('../desktop/.web-teste', import.meta.url));

export default async function setup(): Promise<void> {
  process.env.VITE_PERSISTENCE = 'memory';
  await build({
    mode: 'native',
    logLevel: 'warn',
    build: { outDir: WEB_TESTE, emptyOutDir: true },
  });
}
