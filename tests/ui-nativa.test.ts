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
      expect(texto, `${caminho} usa alert()`).not.toMatch(/(^|[^.\w])alert\s*\(/m);
      expect(texto, `${caminho} usa window.confirm()`).not.toMatch(/window\s*\.\s*confirm\s*\(/);
      expect(texto, `${caminho} usa window.prompt()`).not.toMatch(/window\s*\.\s*prompt\s*\(/);
    }
  });
});
