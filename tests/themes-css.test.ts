// Um tema é só o `:root` do app.css redefinido sob `:root[data-theme="<slug>"]`.
// Isso é barato e frágil ao mesmo tempo: `--acent:#...` num tema passa calado — o
// CSS ignora a declaração e o app fica com a cor da base, sem erro em lugar nenhum.
// Estes testes são a rede que faltava, e valem pra todo tema que existir depois.

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEMAS } from '../src/shared/theme';

const raiz = new URL('../', import.meta.url);
const ler = (rel: string): string => readFileSync(new URL(rel, raiz), 'utf8');

/**
 * Os tokens do `:root` de app.css — a base que todo tema herda.
 *
 * O recorte conta chaves em vez de procurar um `\n}`: o app.css é indentado do
 * começo ao fim e não tem UMA chave de fechamento na coluna 0, então o `indexOf`
 * devolvia -1 e o `slice(0, -1)` entregava o arquivo inteiro — a "base" virava
 * todo token declarado em qualquer regra, e a rede ficava frouxa sem avisar.
 */
function tokensDaBase(): Set<string> {
  const css = ler('src/styles/app.css');
  const abre = css.indexOf('{', css.indexOf(':root'));
  let nivel = 1;
  let i = abre + 1;
  while (i < css.length && nivel > 0) {
    if (css[i] === '{') nivel++;
    else if (css[i] === '}') nivel--;
    i++;
  }
  const bloco = css.slice(abre + 1, i - 1);
  return new Set([...bloco.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
}

function arquivosDeTema(): { slug: string; caminho: string; css: string }[] {
  return readdirSync(new URL('src/styles/themes/', raiz))
    .filter((f) => f.endsWith('.css'))
    .map((f) => ({ slug: f.replace(/\.css$/, ''), caminho: `src/styles/themes/${f}`, css: ler(`src/styles/themes/${f}`) }));
}

describe('os arquivos de tema', () => {
  it('cada um tem um id no catálogo e um import no main.tsx — tema órfão não chega na tela', () => {
    const main = ler('src/main.tsx');
    const ids = TEMAS.map((t) => t.id) as string[];
    const arquivos = arquivosDeTema();
    expect(arquivos.length).toBeGreaterThanOrEqual(2);
    for (const { slug, caminho } of arquivos) {
      expect(ids, `${caminho} não tem entrada em TEMAS`).toContain(slug);
      expect(main, `${caminho} não é importado pelo main.tsx`).toContain(`themes/${slug}.css`);
    }
    for (const id of ids) {
      expect(arquivos.map((a) => a.slug), `o tema "${id}" do catálogo não tem arquivo`).toContain(id);
    }
  });

  it('todo token que um tema declara ou existe na base, ou é usado ali mesmo (pega erro de digitação)', () => {
    const base = tokensDaBase();
    // O número é exato de propósito: se o recorte do `:root` quebrar de novo, ele
    // passa a contar o arquivo inteiro e este teste avisa em vez de afrouxar calado.
    expect(base.size).toBeGreaterThan(200);
    expect(base.size).toBeLessThan(300);
    for (const { caminho, css } of arquivosDeTema()) {
      const declarados = [...new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!))];
      const usados = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!));
      for (const token of declarados) {
        const conhecido = base.has(token) || usados.has(token);
        expect(conhecido, `${caminho} declara ${token}, que não existe na base nem é usado ali`).toBe(true);
      }
    }
  });

  it('tudo o que um tema pinta está debaixo do data-theme dele — nenhum tema vaza cor pro app inteiro', () => {
    for (const { slug, caminho, css } of arquivosDeTema()) {
      // Fora de qualquer bloco `:root[data-theme=...]`/seletor com o atributo, um tema
      // não pode ter regra nenhuma — senão ele valeria também nos outros temas.
      const seletores = [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) => m[2]!.trim());
      for (const sel of seletores) {
        if (sel.startsWith('/*') || sel.startsWith('from') || sel.startsWith('to') || /^\d+%/.test(sel)) continue;
        expect(sel.includes(`[data-theme="${slug}"]`), `${caminho}: o seletor "${sel}" vale fora do tema`).toBe(true);
      }
    }
  });
});
