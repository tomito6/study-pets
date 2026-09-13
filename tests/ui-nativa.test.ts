// O app não usa caixa nativa do navegador. Recusa de save é toast (o padrão dominante:
// Grupos, Janelas do dia, Configurações) ou erro inline (login, apagar conta) — nunca
// um alert(), que rouba o foco, não é estilizável e destoa de tudo o que está em volta.
// Lista escrita à mão não protegeria: a varredura é pela árvore inteira de src/.

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const raiz = new URL('../', import.meta.url);

function fontes(): string[] {
  const achados: string[] = [];
  const varrer = (dir: URL) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.isDirectory()) varrer(new URL(`${item.name}/`, dir));
      else if (/\.tsx?$/.test(item.name)) achados.push(new URL(item.name, dir).pathname);
    }
  };
  varrer(new URL('src/', raiz));
  return achados;
}

describe('caixas nativas do navegador', () => {
  it('nenhum arquivo de src/ chama alert(), window.confirm() ou window.prompt()', () => {
    const arquivos = fontes();
    expect(arquivos.length).toBeGreaterThan(50);
    for (const caminho of arquivos) {
      const texto = readFileSync(caminho, 'utf8');
      // `alert` solto é sempre nativo. `confirm` e `prompt` soltos NÃO são: o app tem
      // funções locais com esses nomes (o `confirm()` do DangerModals), então a forma
      // sem prefixo só é cobrada pro alert — as outras duas, com o objeto global na frente.
      expect(texto, `${caminho} usa alert()`).not.toMatch(/(^|[^.\w])alert\s*\(/m);
      expect(texto, `${caminho} usa uma caixa nativa pelo objeto global`).not.toMatch(
        /\b(window|globalThis|self)\s*\.\s*(alert|confirm|prompt)\s*\(/,
      );
      // ...e a forma solta com um texto dentro, que é como a nativa é chamada de verdade
      // (`confirm('tem certeza?')`). O `confirm()` local do DangerModals não passa argumento,
      // então ele continua livre sem precisar de exceção por arquivo.
      expect(texto, `${caminho} usa confirm()/prompt() nativo`).not.toMatch(
        /(^|[^.\w])(confirm|prompt)\s*\(\s*['"`]/m,
      );
    }
  });
});
