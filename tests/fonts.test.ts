// As fontes são nossas agora (public/fonts/), e não mais do CDN do Google.
//
// Isso troca um risco por outro: antes, um arquivo faltando era problema do Google;
// agora é 404 no nosso domínio, e o navegador cai calado na fonte do sistema. Foi
// exatamente o que aconteceu ao baixá-las — um dos dezoito downloads falhou sem
// ruído, e o CSS ficou apontando pro vazio. Estes testes são o barulho que faltou.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const raiz = new URL('../', import.meta.url);
const css = readFileSync(new URL('src/styles/fonts.css', raiz), 'utf8');
// Pesos que dividem os mesmos bytes apontam pro mesmo arquivo (DM Sans e Lora são
// variáveis), então a lista tem repetição de propósito.
const referenciadas = [...css.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map((m) => m[1]);
const distintas = [...new Set(referenciadas)];

describe('fontes servidas pelo próprio domínio', () => {
  it('todo @font-face aponta pra um arquivo que existe', () => {
    expect(referenciadas.length).toBeGreaterThan(0);
    for (const arquivo of referenciadas) {
      expect(existsSync(new URL(`public/fonts/${arquivo}`, raiz)), `${arquivo} não está em public/fonts/`).toBe(true);
    }
  });

  it('todo arquivo baixado é mesmo um woff2, e não uma página de erro', () => {
    for (const arquivo of referenciadas) {
      const buf = readFileSync(new URL(`public/fonts/${arquivo}`, raiz));
      expect(buf.subarray(0, 4).toString(), `${arquivo} não começa com wOF2`).toBe('wOF2');
      expect(buf.length, `${arquivo} está pequeno demais pra ser uma fonte`).toBeGreaterThan(1000);
    }
  });

  it('nenhuma fonte em public/fonts/ está sobrando, sem ninguém declarar', () => {
    const noDisco = readdirSync(new URL('public/fonts/', raiz)).filter((f) => f.endsWith('.woff2'));
    expect([...noDisco].sort()).toEqual([...distintas].sort());
  });

  it('bytes iguais não viram arquivos diferentes — isso já custou três downloads do mesmo KB', () => {
    const porHash = new Map<string, string[]>();
    for (const arquivo of distintas) {
      const hash = createHash('md5').update(readFileSync(new URL(`public/fonts/${arquivo}`, raiz))).digest('hex');
      porHash.set(hash, [...(porHash.get(hash) ?? []), arquivo]);
    }
    for (const [, iguais] of porHash) {
      expect(iguais, `estes arquivos têm exatamente os mesmos bytes: ${iguais.join(', ')}`).toHaveLength(1);
    }
  });

  it('o preload do index.html aponta pra um arquivo que existe', () => {
    const html = readFileSync(new URL('index.html', raiz), 'utf8');
    for (const [, href] of html.matchAll(/rel="preload"[^>]*href="\/fonts\/([^"]+)"/g)) {
      expect(existsSync(new URL(`public/fonts/${href}`, raiz)), `o preload pede ${href}, que não existe`).toBe(true);
      expect(distintas, `o preload pede ${href}, que nenhum @font-face usa`).toContain(href);
    }
  });

  it('o app não pede fonte a terceiro nenhum — em nenhum CSS, inclusive os que ainda não existem', () => {
    // Lista escrita à mão não protege: um tema novo em src/styles/themes/ podia trazer
    // o @import do Google de volta com os cinco testes verdes. Aqui a busca é pela árvore.
    const css: string[] = [];
    const varrer = (dir: URL) => {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        if (item.isDirectory()) varrer(new URL(`${item.name}/`, dir));
        else if (item.name.endsWith('.css')) css.push(new URL(item.name, dir).pathname);
      }
    };
    varrer(new URL('src/styles/', raiz));
    expect(css.length).toBeGreaterThanOrEqual(3);
    for (const caminho of [...css, new URL('index.html', raiz).pathname]) {
      const texto = readFileSync(caminho, 'utf8');
      expect(texto, `${caminho} fala com o Google Fonts`).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    }
  });

  it('a licença viaja junto com as fontes, como a OFL exige', () => {
    const ofl = readFileSync(new URL('public/fonts/OFL.txt', raiz), 'utf8');
    expect(ofl).toContain('SIL OPEN FONT LICENSE');
    for (const familia of ['DM Sans', 'DM Mono', 'Lora', 'Press Start 2P']) {
      expect(ofl, `falta o copyright de ${familia}`).toContain(familia);
    }
  });
});
