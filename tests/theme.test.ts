// O tema é preferência DESTE dispositivo: `?tema=<slug>` na URL vence e fica
// gravado, senão o `sp-theme` do localStorage, senão o Café de casa. Os DOIS temas
// põem o `data-theme` (desde que o Loft noturno substituiu o escuro herdado, em
// 2026-09-14 — antes o escuro era a ausência do atributo), e o que vive fora do
// CSS — `color-scheme` e a `<meta theme-color>` — é acertado na mesma passada.
//
// Sem DOM de verdade (o Vitest roda em node): localStorage, location, document e
// getComputedStyle são falsos. O `--bg` falso muda conforme o `data-theme` do
// momento, que é o que prova que a meta lê a cor DEPOIS da troca.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TEMAS, applyTheme, initTheme, isThemeId, readTheme, themeInfo } from '../src/shared/theme';

// Valores de mentira de propósito: o que importa é DE QUAL tema a cor veio, não a
// cor em si. Hex de verdade aqui viraria um segundo lugar pra atualizar quando o
// token mudar — e envelheceria calado.
const BG = { cafe: 'bg-do-cafe', loft: 'bg-do-loft', base: 'bg-da-base' };

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
    // O --bg do tema do momento: sem data-theme é a base do app.css.
    getComputedStyle: () => ({
      getPropertyValue: (prop: string) =>
        prop === '--bg' ? (BG[(temaNoHtml() ?? 'base') as keyof typeof BG] ?? BG.base) : '',
    }),
  });
});

afterEach(() => {
  Object.assign(globalThis, { localStorage: undefined, location: undefined, document: undefined, getComputedStyle: undefined });
});

describe('o catálogo', () => {
  it('o Café de casa vem primeiro (é o padrão) e todo tema tem nome e descrição', () => {
    expect(TEMAS[0]!.id).toBe('cafe');
    expect(TEMAS.map((t) => t.id)).toEqual(['cafe', 'loft']);
    for (const t of TEMAS) {
      expect(t.nome.trim()).not.toBe('');
      expect(t.descricao.trim()).not.toBe('');
    }
  });

  it('só slug do catálogo é tema; qualquer outra coisa não é', () => {
    expect(isThemeId('cafe')).toBe(true);
    expect(isThemeId('loft')).toBe(true);
    expect(isThemeId('escuro')).toBe(false); // virou apelido do loft, não é mais um id
    expect(isThemeId('sálvia')).toBe(false); // protótipo descartado, o slug morreu junto
    expect(isThemeId('')).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
  });

  it('themeInfo devolve o tema pedido, e nunca explode', () => {
    expect(themeInfo('loft').nome).toBe('Loft noturno');
    expect(themeInfo('cafe')).toBe(TEMAS[0]);
  });
});

describe('qual tema vale', () => {
  it('dispositivo novo abre no Café de casa', () => {
    expect(readTheme()).toBe('cafe');
  });

  it('o que o usuário escolheu antes sobrevive ao reload', () => {
    guardado.set('sp-theme', 'loft');
    expect(readTheme()).toBe('loft');
  });

  it('quem tinha o escuro gravado abre no Loft, não no claro', () => {
    // O escuro virou o Loft em 2026-09-14. Sem o apelido, o slug morto cairia no
    // padrão — e a primeira abertura trocaria o tema da pessoa pelo OPOSTO, calada.
    guardado.set('sp-theme', 'escuro');
    expect(readTheme()).toBe('loft');
  });

  it('um link velho com ?tema=escuro ainda abre o noturno, e regrava com o slug novo', () => {
    comURL('?tema=escuro');
    expect(readTheme()).toBe('loft');
    expect(guardado.get('sp-theme')).toBe('loft');
  });

  it('lixo no localStorage não emperra o app no nada: cai no padrão', () => {
    guardado.set('sp-theme', 'noturno'); // tema apagado em 2026-09-07
    expect(readTheme()).toBe('cafe');
  });

  it('?tema= vence a escolha guardada — e fica gravado, então o reload sem a query mantém', () => {
    guardado.set('sp-theme', 'cafe');
    comURL('?tema=loft');
    expect(readTheme()).toBe('loft');
    expect(guardado.get('sp-theme')).toBe('loft');

    comURL('');
    expect(readTheme()).toBe('loft');
  });

  it('?tema= com slug que não existe é ignorado (a escolha do dispositivo continua valendo)', () => {
    guardado.set('sp-theme', 'loft');
    comURL('?tema=arco-iris');
    expect(readTheme()).toBe('loft');
    expect(guardado.get('sp-theme')).toBe('loft');
  });

  it('sem storage (modo privado) não quebra: vale o padrão', () => {
    comStorageQuebrado();
    expect(readTheme()).toBe('cafe');
    comURL('?tema=loft');
    expect(readTheme()).toBe('loft'); // a query vale mesmo sem conseguir gravar
  });
});

describe('aplicar o tema', () => {
  it('todo tema põe o data-theme — o :root do app.css virou a base herdada, não um tema', () => {
    applyTheme('cafe');
    expect(temaNoHtml()).toBe('cafe');

    applyTheme('loft');
    expect(temaNoHtml()).toBe('loft');
  });

  it('o color-scheme acompanha o fundo do tema (inputs nativos)', () => {
    applyTheme('cafe');
    expect(raiz.style.colorScheme).toBe('light');

    applyTheme('loft');
    expect(raiz.style.colorScheme).toBe('dark');
  });

  it('grava a escolha, então ela sobrevive ao reload', () => {
    applyTheme('loft');
    expect(guardado.get('sp-theme')).toBe('loft');
    expect(readTheme()).toBe('loft');
  });

  it('a barra do navegador (theme-color) recebe o --bg do tema NOVO, não do anterior', () => {
    applyTheme('cafe');
    expect(meta!.getAttribute('content')).toBe(BG.cafe);

    applyTheme('loft');
    expect(meta!.getAttribute('content')).toBe(BG.loft);
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
    guardado.set('sp-theme', 'loft');
    expect(initTheme()).toBe('loft');
    expect(temaNoHtml()).toBe('loft');
    expect(raiz.style.colorScheme).toBe('dark');
  });

  it('abrir com ?tema= aplica e grava de uma vez', () => {
    guardado.set('sp-theme', 'loft');
    comURL('?tema=cafe');
    expect(initTheme()).toBe('cafe');
    expect(temaNoHtml()).toBe('cafe');
    expect(guardado.get('sp-theme')).toBe('cafe');
  });
});
