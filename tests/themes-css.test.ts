// Um tema é só o `:root` do app.css redefinido sob `:root[data-theme="<slug>"]`.
// Isso é barato e frágil ao mesmo tempo: `--acent:#...` num tema passa calado — o
// CSS ignora a declaração e o app fica com a cor da base, sem erro em lugar nenhum.
// Estes testes são a rede que faltava, e valem pra todo tema que existir depois.

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEMAS } from '../src/shared/theme';

const raiz = new URL('../', import.meta.url);
const ler = (rel: string): string => readFileSync(new URL(rel, raiz), 'utf8');

/** Os tokens do `:root` de app.css — a base que todo tema herda. */
function tokensDaBase(): Set<string> {
  const css = ler('src/styles/app.css');
  const i = css.indexOf(':root {');
  const bloco = css.slice(i, css.indexOf('\n}', i));
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
    expect(base.size).toBeGreaterThan(200);
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
