// O tema é preferência DESTE dispositivo: `?tema=<slug>` na URL vence e fica
// gravado, senão o `sp-theme` do localStorage, senão o Café de casa. O escuro é a
// AUSÊNCIA do `data-theme` (é o que app.css pinta por padrão), e o que vive fora
// do CSS — `color-scheme` e a `<meta theme-color>` — é acertado na mesma passada.
//
// Sem DOM de verdade (o Vitest roda em node): localStorage, location, document e
// getComputedStyle são falsos. O `--bg` falso muda conforme o `data-theme` do
// momento, que é o que prova que a meta lê a cor DEPOIS da troca.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TEMAS, applyTheme, initTheme, isThemeId, readTheme, themeInfo } from '../src/shared/theme';

// Valores de mentira de propósito: o que importa é DE QUAL tema a cor veio, não a
// cor em si. Hex de verdade aqui viraria um segundo lugar pra atualizar quando o
// token mudar — e envelheceria calado.
const BG = { cafe: 'bg-do-cafe', escuro: 'bg-do-escuro' };

let guardado: Map<string, string>;
let raiz: FakeRoot;
let meta: FakeEl | null;

interface FakeEl {
  attrs: Record<string, string>;
  setAttribute(k: string, v: string): void;
  removeAttribute(k: string): void;
  getAttribute(k: string): string | null;
}

interface FakeRoot extends FakeEl {
  style: { colorScheme: string };
}

function novoEl(): FakeEl {
  const attrs: Record<string, string> = {};
  return {
    attrs,
    setAttribute(k, v) {
      attrs[k] = v;
    },
    removeAttribute(k) {
      delete attrs[k];
    },
    getAttribute: (k) => attrs[k] ?? null,
  };
}

/** O tema aplicado no <html> agora, do jeito que o CSS enxerga. */
const temaNoHtml = (): string | null => raiz.getAttribute('data-theme');

function comURL(search: string): void {
  Object.assign(globalThis, { location: { search } });
}

function comStorageQuebrado(): void {
  const boom = () => {
    throw new Error('modo privado');
  };
  Object.assign(globalThis, { localStorage: { getItem: boom, setItem: boom } });
}

function semDocumento(): void {
  Object.assign(globalThis, { document: undefined });
}

beforeEach(() => {
  guardado = new Map();
  raiz = { ...novoEl(), style: { colorScheme: '' } } as FakeRoot;
  meta = novoEl();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => guardado.get(k) ?? null,
      setItem: (k: string, v: string) => void guardado.set(k, v),
    },
    location: { search: '' },
    document: {
      documentElement: raiz,
      querySelector: (sel: string) => (sel.includes('theme-color') ? meta : null),
    },
    // O --bg do tema do momento: sem data-theme é o escuro (o padrão do app.css).
    getComputedStyle: () => ({
      getPropertyValue: (prop: string) =>
        prop === '--bg' ? (temaNoHtml() === 'cafe' ? BG.cafe : BG.escuro) : '',
    }),
  });
});

afterEach(() => {
  Object.assign(globalThis, { localStorage: undefined, location: undefined, document: undefined, getComputedStyle: undefined });
});

describe('o catálogo', () => {
  it('o Café de casa vem primeiro (é o padrão) e todo tema tem nome e descrição', () => {
    expect(TEMAS[0]!.id).toBe('cafe');
    expect(TEMAS.map((t) => t.id)).toEqual(['cafe', 'escuro']);
    for (const t of TEMAS) {
      expect(t.nome.trim()).not.toBe('');
      expect(t.descricao.trim()).not.toBe('');
    }
  });

  it('só slug do catálogo é tema; qualquer outra coisa não é', () => {
    expect(isThemeId('cafe')).toBe(true);
    expect(isThemeId('escuro')).toBe(true);
    expect(isThemeId('sálvia')).toBe(false); // protótipo descartado, o slug morreu junto
    expect(isThemeId('')).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
  });

  it('themeInfo devolve o tema pedido, e nunca explode', () => {
    expect(themeInfo('escuro').nome).toBe('Escuro');
    expect(themeInfo('cafe')).toBe(TEMAS[0]);
  });
});

describe('qual tema vale', () => {
  it('dispositivo novo abre no Café de casa', () => {
    expect(readTheme()).toBe('cafe');
  });

  it('o que o usuário escolheu antes sobrevive ao reload', () => {
    guardado.set('sp-theme', 'escuro');
    expect(readTheme()).toBe('escuro');
  });

  it('lixo no localStorage não emperra o app no nada: cai no padrão', () => {
    guardado.set('sp-theme', 'noturno'); // tema apagado em 2026-09-07
    expect(readTheme()).toBe('cafe');
  });

  it('?tema= vence a escolha guardada — e fica gravado, então o reload sem a query mantém', () => {
    guardado.set('sp-theme', 'cafe');
    comURL('?tema=escuro');
    expect(readTheme()).toBe('escuro');
    expect(guardado.get('sp-theme')).toBe('escuro');

    comURL('');
    expect(readTheme()).toBe('escuro');
  });

  it('?tema= com slug que não existe é ignorado (a escolha do dispositivo continua valendo)', () => {
    guardado.set('sp-theme', 'escuro');
    comURL('?tema=arco-iris');
    expect(readTheme()).toBe('escuro');
    expect(guardado.get('sp-theme')).toBe('escuro');
  });

  it('sem storage (modo privado) não quebra: vale o padrão', () => {
    comStorageQuebrado();
    expect(readTheme()).toBe('cafe');
    comURL('?tema=escuro');
    expect(readTheme()).toBe('escuro'); // a query vale mesmo sem conseguir gravar
  });
});

describe('aplicar o tema', () => {
  it('o escuro é a ausência do data-theme; o Café de casa põe o atributo', () => {
    applyTheme('cafe');
    expect(temaNoHtml()).toBe('cafe');

    applyTheme('escuro');
    expect(temaNoHtml()).toBeNull();
  });

  it('o color-scheme acompanha o fundo do tema (inputs nativos)', () => {
    applyTheme('cafe');
    expect(raiz.style.colorScheme).toBe('light');

    applyTheme('escuro');
    expect(raiz.style.colorScheme).toBe('dark');
  });

  it('grava a escolha, então ela sobrevive ao reload', () => {
    applyTheme('escuro');
    expect(guardado.get('sp-theme')).toBe('escuro');
    expect(readTheme()).toBe('escuro');
  });

  it('a barra do navegador (theme-color) recebe o --bg do tema NOVO, não do anterior', () => {
    applyTheme('cafe');
    expect(meta!.getAttribute('content')).toBe(BG.cafe);

    applyTheme('escuro');
    expect(meta!.getAttribute('content')).toBe(BG.escuro);
  });

  it('sem a meta no html, aplica o tema do mesmo jeito', () => {
    meta = null;
    expect(() => applyTheme('cafe')).not.toThrow();
    expect(temaNoHtml()).toBe('cafe');
  });

  it('sem documento (SSR / teste) é no-op silencioso', () => {
    semDocumento();
    expect(() => applyTheme('cafe')).not.toThrow();
    expect(guardado.has('sp-theme')).toBe(false); // nem grava: não houve troca de tema
  });
});

describe('initTheme (o boot, antes do React montar)', () => {
  it('aplica o que vale e devolve o slug', () => {
    guardado.set('sp-theme', 'escuro');
    expect(initTheme()).toBe('escuro');
    expect(temaNoHtml()).toBeNull();
    expect(raiz.style.colorScheme).toBe('dark');
  });

  it('abrir com ?tema= aplica e grava de uma vez', () => {
    guardado.set('sp-theme', 'escuro');
    comURL('?tema=cafe');
    expect(initTheme()).toBe('cafe');
    expect(temaNoHtml()).toBe('cafe');
    expect(guardado.get('sp-theme')).toBe('cafe');
  });
});
