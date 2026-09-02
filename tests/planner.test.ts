import { describe, expect, it } from 'vitest';
import { calcActualEnd, generateBlocks } from '../src/domain/planner';
import type { PlannerConfig, StudyEvent } from '../src/domain/types';

const base: PlannerConfig = {
  studyWindows: [{ start: '09:00', end: '18:00' }],
  start: '09:00',
  end: '18:00',
  lunch: '13:00',
  lunchDur: 60,
  hasLunch: true,
  pomo: 25,
  shortBreak: 5,
  longBreak: 20,
};

const cfg = (over: Partial<PlannerConfig> = {}): PlannerConfig => ({ ...base, ...over });

describe('generateBlocks — geração básica', () => {
  it('gera pomodoros de estudo com a duração configurada', () => {
    const blocks = generateBlocks(
      cfg({ hasLunch: false, studyWindows: [{ start: '09:00', end: '11:00' }] }),
    );
    const estudos = blocks.filter((b) => b.type === 'estudo');
    expect(estudos.length).toBeGreaterThan(0);
    expect(estudos[0]).toMatchObject({ time: '09:00', endTime: '09:25', type: 'estudo' });
  });

  it('dá 2 XP por minuto de estudo', () => {
    const blocks = generateBlocks(
      cfg({ hasLunch: false, pomo: 30, studyWindows: [{ start: '09:00', end: '11:00' }] }),
    );
    expect(blocks.find((b) => b.type === 'estudo')!.xp).toBe(60);
  });

  it('intercala pausa curta e usa pausa longa a cada 4 pomos', () => {
    const blocks = generateBlocks(
      cfg({ hasLunch: false, studyWindows: [{ start: '09:00', end: '14:00' }] }),
    );
    const pausas = blocks.filter((b) => b.type === 'pausa');
    expect(pausas.some((p) => p.name.includes('Pausa longa'))).toBe(true);
    expect(pausas.some((p) => p.name === '🧘 Pausa')).toBe(true);
  });

  it('devolve lista vazia quando a janela é inválida (fim <= início)', () => {
    expect(generateBlocks(cfg({ studyWindows: [{ start: '18:00', end: '09:00' }] }))).toEqual([]);
  });
});

describe('generateBlocks — último bloco do dia é sempre estudo', () => {
  const casos: Array<[string, PlannerConfig]> = [
    ['dia padrão', cfg()],
    ['sem almoço', cfg({ hasLunch: false })],
    ['pomo longo', cfg({ pomo: 50, shortBreak: 10, longBreak: 30 })],
    ['dia curto', cfg({ hasLunch: false, studyWindows: [{ start: '09:00', end: '10:00' }] })],
    ['pausa longa grande', cfg({ longBreak: 45 })],
    [
      'duas janelas',
      cfg({
        studyWindows: [
          { start: '09:00', end: '12:00' },
          { start: '15:00', end: '20:00' },
        ],
      }),
    ],
  ];

  it.each(casos)('%s nunca termina em pausa', (_nome, c) => {
    const blocks = generateBlocks(c);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[blocks.length - 1]!.type).not.toBe('pausa');
  });
});

describe('generateBlocks — múltiplas janelas de estudo', () => {
  const duasJanelas = cfg({
    hasLunch: false,
    studyWindows: [
      { start: '09:00', end: '12:00' },
      { start: '15:00', end: '20:00' },
    ],
  });

  it('não gera estudo no intervalo entre as janelas', () => {
    const blocks = generateBlocks(duasJanelas);
    const noGap = blocks.filter((b) => b.type === 'estudo' && b.time >= '12:00' && b.time < '15:00');
    expect(noGap).toEqual([]);
  });

  it('gera estudo nas duas janelas', () => {
    const blocks = generateBlocks(duasJanelas);
    expect(blocks.some((b) => b.type === 'estudo' && b.time < '12:00')).toBe(true);
    expect(blocks.some((b) => b.type === 'estudo' && b.time >= '15:00')).toBe(true);
  });

  it('ordena as janelas mesmo se vierem fora de ordem', () => {
    const blocks = generateBlocks(
      cfg({
        hasLunch: false,
        studyWindows: [
          { start: '15:00', end: '18:00' },
          { start: '09:00', end: '12:00' },
        ],
      }),
    );
    expect(blocks[0]!.time).toBe('09:00');
  });
});

describe('generateBlocks — almoço', () => {
  it('emite o almoço como bloco próprio, sem XP', () => {
    const almoco = generateBlocks(cfg()).find((b) => b.type === 'almoco');
    expect(almoco).toMatchObject({ time: '13:00', endTime: '14:00', xp: 0 });
  });

  it('não emite almoço quando hasLunch é false', () => {
    expect(generateBlocks(cfg({ hasLunch: false })).some((b) => b.type === 'almoco')).toBe(false);
  });

  it('respeita a duração configurada', () => {
    const blocks = generateBlocks(cfg({ lunch: '12:30', lunchDur: 90 }));
    expect(blocks.find((b) => b.type === 'almoco')).toMatchObject({
      time: '12:30',
      endTime: '14:00',
    });
  });

  it('não gera estudo por cima do almoço', () => {
    const blocks = generateBlocks(cfg());
    const invadindo = blocks.filter(
      (b) => b.type === 'estudo' && b.time >= '13:00' && b.time < '14:00',
    );
    expect(invadindo).toEqual([]);
  });
});

describe('generateBlocks — eventos', () => {
  const ev = (over: Partial<StudyEvent> = {}): StudyEvent => ({
    name: 'Aula de Cálculo',
    start: '10:00',
    end: '11:30',
    ...over,
  });

  it('evento que conta como estudo vira bloco event com XP pela duração real', () => {
    const bloco = generateBlocks(cfg({ hasLunch: false }), [ev()]).find((b) => b.type === 'event');
    expect(bloco).toMatchObject({ time: '10:00', endTime: '11:30', xp: 180 });
    expect(bloco!.name).toContain('Aula de Cálculo');
  });

  it('evento que não conta como estudo vira intervalo sem XP', () => {
    const blocks = generateBlocks(cfg({ hasLunch: false }), [ev({ countsAsStudy: false })]);
    expect(blocks.find((b) => b.type === 'intervalo')).toMatchObject({ xp: 0 });
    expect(blocks.some((b) => b.type === 'event')).toBe(false);
  });

  it('trata countsAsStudy ausente como true (retrocompat)', () => {
    expect(
      generateBlocks(cfg({ hasLunch: false }), [ev()]).some((b) => b.type === 'event'),
    ).toBe(true);
  });

  it('não gera estudo dentro do horário do evento', () => {
    const blocks = generateBlocks(cfg({ hasLunch: false }), [ev()]);
    const invadindo = blocks.filter(
      (b) => b.type === 'estudo' && b.time >= '10:00' && b.time < '11:30',
    );
    expect(invadindo).toEqual([]);
  });

  it('lida com eventos sobrepostos sem gerar estudo por cima', () => {
    const eventos = [
      ev({ name: 'A', start: '10:00', end: '11:30' }),
      ev({ name: 'B', start: '11:00', end: '12:00' }),
    ];
    const blocks = generateBlocks(cfg({ hasLunch: false }), eventos);
    const invadindo = blocks.filter(
      (b) => b.type === 'estudo' && b.time >= '10:00' && b.time < '12:00',
    );
    expect(invadindo).toEqual([]);
    expect(blocks.filter((b) => b.type === 'event').length).toBeGreaterThan(0);
  });

  it('preserva o _seriesId de ocorrências de série', () => {
    const blocks = generateBlocks(cfg({ hasLunch: false }), [ev({ _seriesId: 'ser_123' })]);
    expect(blocks.find((b) => b.type === 'event')!._seriesId).toBe('ser_123');
  });

  it('emite evento que acontece depois da última janela', () => {
    const blocks = generateBlocks(
      cfg({ hasLunch: false, studyWindows: [{ start: '09:00', end: '12:00' }] }),
      [ev({ name: 'Treino', start: '19:00', end: '20:00' })],
    );
    expect(blocks.some((b) => b.name.includes('Treino'))).toBe(true);
  });
});

describe('generateBlocks — sobras menores que um pomodoro', () => {
  // Janela de 1h com pomo de 30: o evento no fim cria a sobra que queremos exercitar.
  const comEvento = (evStart: string, evEnd: string) =>
    generateBlocks(
      cfg({ hasLunch: false, pomo: 30, shortBreak: 5, studyWindows: [{ start: '09:00', end: '10:00' }] }),
      [{ name: 'Consulta', start: evStart, end: evEnd }],
    );

  it('vira mini-estudo quando a sobra é >= metade do pomo', () => {
    const mini = comEvento('09:45', '10:00').find((b) => b.mini === true);
    expect(mini).toMatchObject({ time: '09:30', endTime: '09:45', type: 'estudo' });
  });

  it('mini-estudo rende XP pela duração real, não pelo pomo cheio', () => {
    // 15 min de estudo = 30 XP, não os 60 XP de um pomo de 30 min.
    expect(comEvento('09:45', '10:00').find((b) => b.mini === true)!.xp).toBe(30);
  });

  it('estica o último estudo quando a sobra é menor que metade do pomo', () => {
    const blocks = comEvento('09:40', '10:00');
    expect(blocks.filter((b) => b.mini === true)).toEqual([]);
    expect(blocks[0]).toMatchObject({ time: '09:00', endTime: '09:40', xp: 80 });
  });
});

describe('generateBlocks — comportamento herdado (caracterização, não aprovação)', () => {
  it('emite pausa curta sobreposta ao evento quando o pomo acaba na hora exata em que ele começa', () => {
    // Bug que já existia antes da migração: o pomo 09:30–10:00 termina exatamente
    // quando o evento das 10:00 começa, e a pausa é emitida por cima dele.
    // O teste trava o comportamento atual pra que consertar isso seja uma decisão
    // consciente, com o efeito visível no diff — e não um acidente de refatoração.
    const blocks = generateBlocks(
      cfg({ hasLunch: false, pomo: 30, shortBreak: 5, studyWindows: [{ start: '09:00', end: '11:00' }] }),
      [{ name: 'Consulta', start: '10:00', end: '10:20' }],
    );
    expect(blocks.find((b) => b.type === 'pausa')).toMatchObject({ time: '10:00', endTime: '10:05' });
    expect(blocks.find((b) => b.type === 'event')).toMatchObject({ time: '10:00', endTime: '10:20' });
  });
});

describe('generateBlocks — config antiga sem studyWindows', () => {
  it('usa start/end como janela única', () => {
    const antiga: PlannerConfig = {
      start: '08:00',
      end: '12:00',
      lunch: '13:00',
      lunchDur: 60,
      hasLunch: false,
      pomo: 25,
      shortBreak: 5,
      longBreak: 20,
    };
    const blocks = generateBlocks(antiga);
    expect(blocks[0]!.time).toBe('08:00');
    expect(blocks.some((b) => b.type === 'estudo')).toBe(true);
  });

  it('ignora studyWindows vazio e cai no fallback', () => {
    const blocks = generateBlocks(cfg({ studyWindows: [], start: '08:00', end: '12:00', hasLunch: false }));
    expect(blocks[0]!.time).toBe('08:00');
  });
});

describe('calcActualEnd', () => {
  it('devolve o fim do último estudo, não o fim da janela', () => {
    expect(calcActualEnd(cfg({ hasLunch: false, studyWindows: [{ start: '09:00', end: '10:00' }] }))).toBe(
      '09:55',
    );
  });
});
