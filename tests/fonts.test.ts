// As fontes são nossas agora (public/fonts/), e não mais do CDN do Google.
//
// Isso troca um risco por outro: antes, um arquivo faltando era problema do Google;
// agora é 404 no nosso domínio, e o navegador cai calado na fonte do sistema. Foi
// exatamente o que aconteceu ao baixá-las — um dos dezoito downloads falhou sem
// ruído, e o CSS ficou apontando pro vazio. Estes testes são o barulho que faltou.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const raiz = new URL('../', import.meta.url);
const css = readFileSync(new URL('src/styles/fonts.css', raiz), 'utf8');
const referenciadas = [...css.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map((m) => m[1]);

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
    expect([...noDisco].sort()).toEqual([...referenciadas].sort());
  });

  it('o app não pede fonte a terceiro nenhum', () => {
    const html = readFileSync(new URL('index.html', raiz), 'utf8');
    for (const arquivo of ['index.html', 'src/styles/app.css', 'src/styles/login.css', 'src/styles/fonts.css']) {
      const texto = arquivo === 'index.html' ? html : readFileSync(new URL(arquivo, raiz), 'utf8');
      expect(texto, `${arquivo} ainda fala com o Google`).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
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
