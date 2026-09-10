import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import {
  AVATAR_FRAMES,
  AVATAR_H,
  AVATAR_W,
  BODIES,
  DEFAULT_AVATAR,
  HAIRS,
  HAIR_STYLES,
  SKINS,
  avatarAscii,
  avatarFrames,
  avatarPalette,
  hairOf,
  normalizeAvatar,
  skinOf,
} from '../src/domain/avatar';

const IDS = (l: ReadonlyArray<{ id: string }>) => l.map((x) => x.id);

describe('catálogo de aparências', () => {
  it('seis tons de pele, nove cores de cabelo, seis penteados e dois corpos, todos com id único', () => {
    expect(SKINS).toHaveLength(6);
    expect(HAIRS).toHaveLength(9);
    expect(HAIR_STYLES).toHaveLength(6);
    expect(BODIES).toHaveLength(2);
    for (const l of [IDS(SKINS), IDS(HAIRS), IDS(HAIR_STYLES), IDS(BODIES)]) expect(new Set(l).size).toBe(l.length);
    // 6 × 9 × 6 × 2 aparências sem um PNG a mais.
    expect(SKINS.length * HAIRS.length * HAIR_STYLES.length * BODIES.length).toBe(648);
  });

  it('os tons de pele vão do claro ao escuro, com o contorno sempre mais escuro que a sombra', () => {
    const luz = ([r, g, b]: readonly [number, number, number]) => r + g + b;
    const tons = SKINS.map((s) => luz(s.base));
    expect([...tons].sort((a, b) => b - a)).toEqual(tons); // já ordenados do mais claro
    for (const s of SKINS) {
      expect(luz(s.shade), s.id).toBeLessThan(luz(s.base));
      expect(luz(s.line), s.id).toBeLessThan(luz(s.shade));
    }
    for (const h of HAIRS) expect(luz(h.shade), h.id).toBeLessThan(luz(h.base));
  });

  it('normalizeAvatar: o que não existe no catálogo vira o padrão', () => {
    expect(normalizeAvatar(undefined)).toEqual(DEFAULT_AVATAR);
    expect(normalizeAvatar({ skin: 'ebano', hair: 'ruivo', style: 'cacheado', body: 'curvo' }))
      .toEqual({ skin: 'ebano', hair: 'ruivo', style: 'cacheado', body: 'curvo' });
    expect(normalizeAvatar({ skin: 'roxo', hair: 42, style: null, body: 'triangular' })).toEqual(DEFAULT_AVATAR);
    // Documento antigo (antes dos dois corpos) continua abrindo, no corpo padrão.
    expect(normalizeAvatar({ skin: 'ebano', hair: 'ruivo', style: 'coque' }).body).toBe(DEFAULT_AVATAR.body);
    // Um id que sumir do catálogo cai no padrão em vez de virar buraco na tela.
    expect(normalizeAvatar({ skin: 'ebano', hair: 'neon', style: 'coque' }))
      .toEqual({ skin: 'ebano', hair: DEFAULT_AVATAR.hair, style: 'coque', body: DEFAULT_AVATAR.body });
    expect(skinOf('nada').id).toBe(DEFAULT_AVATAR.skin);
    expect(hairOf('nada').id).toBe(DEFAULT_AVATAR.hair);
  });
});

describe('o desenho', () => {
  it('todo penteado, em todo corpo, dá 4 frames de 24×42', () => {
    for (const b of BODIES) for (const s of HAIR_STYLES) {
      const frames = avatarFrames(s.id, b.id);
      expect(frames, s.id).toHaveLength(AVATAR_FRAMES);
      for (const g of frames) {
        expect(g, s.id).toHaveLength(AVATAR_H);
        for (const row of g) expect(row.length, s.id).toBe(AVATAR_W);
      }
    }
  });

  it('nenhuma letra do desenho fica sem cor — um typo viraria buraco na tela', () => {
    const palette = avatarPalette(DEFAULT_AVATAR);
    for (const b of BODIES) for (const s of HAIR_STYLES) {
      for (const grid of avatarFrames(s.id, b.id)) {
        for (const row of grid) {
          for (const c of row) {
            if (c === '.') continue;
            expect(palette[c], `${s.id}: letra "${c}" sem cor`).toBeDefined();
          }
        }
      }
    }
  });

  it('a paleta muda com a escolha, e o desenho não', () => {
    const a = avatarPalette({ skin: 'areia', hair: 'loiro', style: 'curto', body: 'reto' });
    const b = avatarPalette({ skin: 'ebano', hair: 'preto', style: 'curto', body: 'reto' });
    expect(a.S).not.toEqual(b.S);
    expect(a.H).not.toEqual(b.H);
    expect(a.K).not.toEqual(b.K); // o contorno acompanha a pele
    expect(a.C).toEqual(b.C); // a roupa é a mesma até existir cosmético
    // O grid é só do penteado: trocar de cor não redesenha nada.
    expect(avatarFrames('curto')).toBe(avatarFrames('curto'));
  });

  it('respira: os frames do meio sobem 1 px e voltam', () => {
    const [f0, f1, f2, f3] = avatarFrames('curto');
    expect(f0).toEqual(f3);
    expect(f1).toEqual(f2);
    expect(f1).not.toEqual(f0);
    // Subir 1 px = a linha 9 do frame parado aparece na 8 do frame que respira.
    expect(f1![8]).toBe(f0![9]);
  });

  it('cada penteado tem uma silhueta própria — não são o mesmo cabelo repintado', () => {
    const vistos = new Map<string, string>();
    for (const s of HAIR_STYLES) {
      const arte = avatarAscii(s.id);
      expect(arte, s.id).not.toBe(avatarAscii(s.id, 0, 'curvo')); // e o corpo também muda
      expect(vistos.has(arte), `${s.id} é igual a ${vistos.get(arte)}`).toBe(false);
      vistos.set(arte, s.id);
      expect(arte.includes('H'), `${s.id} não tem cabelo`).toBe(true);
      expect(arte.includes('W'), `${s.id} tapou os olhos`).toBe(true);
      expect(arte.includes('S'), `${s.id} tapou o rosto`).toBe(true);
    }
  });

  it('o volume do cacheado e o comprimento do longo passam mesmo da cabeça', () => {
    const largura = (id: string) =>
      Math.max(...avatarFrames(id)[0]!.map((r) => r.replace(/\.+$/, '').length - (r.length - r.replace(/^\.+/, '').length)));
    expect(largura('cacheado')).toBeGreaterThan(largura('curto'));
    // O longo desce até depois da cintura (o tronco acaba na linha 33).
    const longo = avatarFrames('longo')[0]!;
    expect(longo[30]!.includes('H') || longo[30]!.includes('h')).toBe(true);
  });

  it('o rosto é simétrico em todo penteado — nenhuma mecha solta cai numa bochecha só', () => {
    // Da testa ao queixo. Acima disso o cabelo PODE ser assimétrico (é textura).
    for (const b of BODIES) for (const s of HAIR_STYLES) {
      const grid = avatarFrames(s.id, b.id)[0]!;
      for (let y = 9; y <= 19; y++) {
        const row = grid[y]!;
        for (let x = 0; x < AVATAR_W / 2; x++) {
          expect(row[x], `${s.id}/${b.id} linha ${y}, x=${x} vs x=${AVATAR_W - 1 - x}`).toBe(row[AVATAR_W - 1 - x]);
        }
      }
    }
  });

  it('o olho é cílio, branco e pupila — nessa ordem, de cima pra baixo', () => {
    for (const b of BODIES) {
      const g = avatarFrames('curto', b.id)[0]!;
      const cilio = g.findIndex((r) => r.includes('L'));
      const branco = g.findIndex((r) => r.includes('W'));
      expect(cilio, b.id).toBeGreaterThan(0);
      expect(branco, b.id).toBe(cilio + 1);           // a pálpebra fica logo acima do olho
      expect(g[branco]!.includes('E'), b.id).toBe(true); // e a pupila, dentro do branco
      // Um olho por lado, os dois do mesmo tamanho.
      expect(g[cilio]!.match(/L+/g)!.map((m) => m.length)).toEqual([3, 3]);
    }
  });

  it('o cílio é mais escuro que o traço da pele, que já é mais escuro que a sombra', () => {
    const luz = ([r, g, b]: readonly [number, number, number]) => r + g + b;
    for (const skin of SKINS) {
      const p = avatarPalette({ ...DEFAULT_AVATAR, skin: skin.id });
      expect(luz(p.L!), skin.id).toBeLessThan(luz(p.K!));
    }
  });

  it('os dois corpos dividem a mesma cabeça e mudam só do ombro pra baixo', () => {
    const reto = avatarFrames('curto', 'reto')[0]!;
    const curvo = avatarFrames('curto', 'curvo')[0]!;
    for (let y = 0; y <= 21; y++) expect(curvo[y], `linha ${y}`).toBe(reto[y]);
    expect(curvo.slice(22)).not.toEqual(reto.slice(22));
  });

  it('o corpo curvo tem a cintura mais estreita que o ombro; o reto não afina', () => {
    const cheio = (row: string) => row.replace(/\./g, '').length;
    const larguras = (id: string) => {
      const g = avatarFrames('curto', id)[0]!;
      return { ombro: cheio(g[23]!), cintura: cheio(g[28]!) };
    };
    const reto = larguras('reto');
    const curvo = larguras('curvo');
    expect(curvo.cintura).toBeLessThan(curvo.ombro);
    expect(reto.cintura).toBe(reto.ombro);
    expect(curvo.ombro).toBeLessThanOrEqual(reto.ombro); // e nunca fica mais largo que o outro
  });

  it('os PNGs do personagem padrão existem em public/idle/user/', () => {
    for (let i = 0; i < AVATAR_FRAMES; i++) {
      expect(existsSync(`public/idle/user/${i}.png`), `frame ${i}`).toBe(true);
    }
  });
});
