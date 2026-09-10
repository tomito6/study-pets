import { describe, expect, it } from 'vitest';
import { DEFAULT_CFG } from '../src/domain/config';
import { calcActualEnd, generateBlocks } from '../src/domain/planner';
import { blockMins } from '../src/domain/time';
import type { PauseRecord, PlannerConfig, StudyEvent } from '../src/domain/types';

const base: PlannerConfig = {
  studyWindows: [{ start: '09:00', end: '18:00' }],
  start: '09:00',
  end: '18:00',
  pomo: 25,
  shortBreak: 5,
  longBreak: 20,
};

const cfg = (over: Partial<PlannerConfig> = {}): PlannerConfig => ({ ...base, ...over });

describe('generateBlocks — geração básica', () => {
  it('gera pomodoros de estudo com a duração configurada', () => {
    const blocks = generateBlocks(
      cfg({ studyWindows: [{ start: '09:00', end: '11:00' }] }),
    );
    const estudos = blocks.filter((b) => b.type === 'estudo');
    expect(estudos.length).toBeGreaterThan(0);
    expect(estudos[0]).toMatchObject({ time: '09:00', endTime: '09:25', type: 'estudo' });
  });

  it('dá 2 XP por minuto de estudo', () => {
    const blocks = generateBlocks(
      cfg({ pomo: 30, studyWindows: [{ start: '09:00', end: '11:00' }] }),
    );
    expect(blocks.find((b) => b.type === 'estudo')!.xp).toBe(60);
  });

  it('intercala pausa curta e usa pausa longa a cada 4 pomos', () => {
    const blocks = generateBlocks(
      cfg({ studyWindows: [{ start: '09:00', end: '14:00' }] }),
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
    ['dia inteiro sem bloqueio', cfg()],
    ['pomo longo', cfg({ pomo: 50, shortBreak: 10, longBreak: 30 })],
    ['dia curto', cfg({ studyWindows: [{ start: '09:00', end: '10:00' }] })],
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
        studyWindows: [
          { start: '15:00', end: '18:00' },
          { start: '09:00', end: '12:00' },
        ],
      }),
    );
    expect(blocks[0]!.time).toBe('09:00');
  });
});

describe('generateBlocks — refeição (um evento sem XP, desde que o almoço saiu da config)', () => {
  const almoco: StudyEvent = { name: '🍽️ Almoço', start: '13:00', end: '14:00', countsAsStudy: false };

  it('sem evento nenhum, o dia é só estudo e pausa', () => {
    expect(generateBlocks(cfg()).every((b) => b.type === 'estudo' || b.type === 'pausa')).toBe(true);
  });

  it('a refeição entra como intervalo, sem XP, com o nome dela (sem 📅: já tem ícone)', () => {
    const bloco = generateBlocks(cfg(), [almoco]).find((b) => b.type === 'intervalo');
    expect(bloco).toMatchObject({ time: '13:00', endTime: '14:00', xp: 0, name: '🍽️ Almoço' });
  });

  it('respeita horário e duração do evento', () => {
    const blocks = generateBlocks(cfg(), [{ ...almoco, start: '12:30', end: '14:00' }]);
    expect(blocks.find((b) => b.type === 'intervalo')).toMatchObject({ time: '12:30', endTime: '14:00' });
  });

  it('não gera estudo por cima da refeição', () => {
    const blocks = generateBlocks(cfg(), [almoco]);
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
    const bloco = generateBlocks(cfg(), [ev()]).find((b) => b.type === 'event');
    expect(bloco).toMatchObject({ time: '10:00', endTime: '11:30', xp: 180 });
    expect(bloco!.name).toContain('Aula de Cálculo');
  });

  it('evento que não conta como estudo vira intervalo sem XP', () => {
    const blocks = generateBlocks(cfg(), [ev({ countsAsStudy: false })]);
    expect(blocks.find((b) => b.type === 'intervalo')).toMatchObject({ xp: 0 });
    expect(blocks.some((b) => b.type === 'event')).toBe(false);
  });

  it('trata countsAsStudy ausente como true (retrocompat)', () => {
    expect(
      generateBlocks(cfg(), [ev()]).some((b) => b.type === 'event'),
    ).toBe(true);
  });

  it('não gera estudo dentro do horário do evento', () => {
    const blocks = generateBlocks(cfg(), [ev()]);
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
    const blocks = generateBlocks(cfg(), eventos);
    const invadindo = blocks.filter(
      (b) => b.type === 'estudo' && b.time >= '10:00' && b.time < '12:00',
    );
    expect(invadindo).toEqual([]);
    expect(blocks.filter((b) => b.type === 'event').length).toBeGreaterThan(0);
  });

  it('preserva o _seriesId de ocorrências de série', () => {
    const blocks = generateBlocks(cfg(), [ev({ _seriesId: 'ser_123' })]);
    expect(blocks.find((b) => b.type === 'event')!._seriesId).toBe('ser_123');
  });

  it('emite evento que acontece depois da última janela', () => {
    const blocks = generateBlocks(
      cfg({ studyWindows: [{ start: '09:00', end: '12:00' }] }),
      [ev({ name: 'Treino', start: '19:00', end: '20:00' })],
    );
    expect(blocks.some((b) => b.name.includes('Treino'))).toBe(true);
  });
});

describe('generateBlocks — sobras menores que um pomodoro', () => {
  // Janela de 1h com pomo de 30: o evento no fim cria a sobra que queremos exercitar.
  const comEvento = (evStart: string, evEnd: string) =>
    generateBlocks(
      cfg({ pomo: 30, shortBreak: 5, studyWindows: [{ start: '09:00', end: '10:00' }] }),
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

describe('generateBlocks — pausa nunca invade um bloqueio', () => {
  // Bug anterior à migração: quando o pomo terminava exatamente no minuto em que o
  // evento começava, a pausa era emitida por cima do evento. Decisão (2026-09-03):
  // a pausa some e o plano vai direto pro evento — igual ao que já acontecia quando
  // a pausa invadiria um evento alguns minutos depois.
  const resumo = (blocks: ReturnType<typeof generateBlocks>) => blocks.map((b) => `${b.time}-${b.endTime} ${b.type}`);

  it('pomo que termina exatamente onde o evento começa: sem pausa, direto pro evento', () => {
    const blocks = generateBlocks(
      cfg({ pomo: 30, shortBreak: 5, studyWindows: [{ start: '09:00', end: '11:00' }] }),
      [{ name: 'Consulta', start: '10:00', end: '10:20' }],
    );
    expect(resumo(blocks)).toEqual([
      '09:00-09:30 estudo',
      '09:30-10:00 estudo', // a pausa das 09:30 é pulada pra caber um pomo inteiro antes do evento
      '10:00-10:20 event',
      '10:20-11:00 estudo', // a sobra de 10 min no fim da janela estica o último estudo (2026-09-10; antes era jogada fora)
    ]);
  });

  it('config padrão com evento às 10:20 (o caso que aparecia na tela)', () => {
    const blocks = generateBlocks(cfg({}), [{ name: 'Consulta', start: '10:20', end: '11:00' }]);
    expect(resumo(blocks).slice(2, 6)).toEqual([
      '09:30-09:55 estudo',
      '09:55-10:20 estudo',
      '10:20-11:00 event',
      '11:00-11:25 estudo',
    ]);
    expect(blocks.filter((b) => b.type === 'pausa' && b.time === '10:20')).toEqual([]);
  });

  it('nenhuma pausa termina depois do bloco seguinte', () => {
    const casos = [
      generateBlocks(cfg({}), [{ name: 'A', start: '10:20', end: '11:00' }]),
      generateBlocks(cfg({ pomo: 30 }), [{ name: 'B', start: '10:00', end: '10:20' }]),
      generateBlocks(cfg({ pomo: 50, shortBreak: 10 }), [{ name: 'C', start: '09:50', end: '10:30' }]),
    ];
    for (const blocks of casos) {
      blocks.forEach((b, i) => {
        const next = blocks[i + 1];
        if (b.type === 'pausa' && next) expect(next.time >= b.endTime, `${b.time}-${b.endTime} pausa invade ${next.time}`).toBe(true);
      });
    }
  });
});

describe('generateBlocks — a sobra no fim da janela vira estudo (2026-09-10)', () => {
  // Até aqui a regra "mini se >= metade, senão estica" só valia antes de um evento: no fim da
  // janela, depois de um pomo normal, o laço saía e a sobra sumia — 20 min com pomo de 25 não
  // viravam nada. Agora o fim da janela é tratado como qualquer outro limite.
  const janela = (end: string, over: Partial<PlannerConfig> = {}) =>
    generateBlocks(cfg({ longBreak: 15, studyWindows: [{ start: '09:00', end }], ...over }));
  const resumo = (blocks: ReturnType<typeof generateBlocks>) => blocks.map((b) => `${b.time}-${b.endTime} ${b.type}${b.mini ? ' mini' : ''}`);

  it('sobra >= metade do pomo depois da pausa: a pausa fica e a sobra vira mini', () => {
    expect(resumo(janela('09:50'))).toEqual(['09:00-09:25 estudo', '09:25-09:30 pausa', '09:30-09:50 estudo mini']);
    expect(janela('09:50')[2]!.xp).toBe(40);
  });

  it('sobra menor que isso: sem pausa, o último estudo vai até o fim da janela', () => {
    expect(resumo(janela('09:35'))).toEqual(['09:00-09:35 estudo']);
    expect(janela('09:35')[0]!.xp).toBe(70);
  });

  it('o dia inteiro: 10:20 ganha um mini de 20 min que antes sumia', () => {
    expect(resumo(janela('10:20'))).toEqual([
      '09:00-09:25 estudo', '09:25-09:30 pausa', '09:30-09:55 estudo', '09:55-10:00 pausa', '10:00-10:20 estudo mini',
    ]);
  });

  it('janela que fecha em ciclo não muda: o dia padrão continua terminando em estudo cheio', () => {
    const blocks = generateBlocks(DEFAULT_CFG);
    expect(blocks[blocks.length - 1]).toMatchObject({ time: '17:15', endTime: '17:40', type: 'estudo', xp: 50 });
    expect(blocks.some((b) => b.mini)).toBe(false);
  });

  it('o último estudo só é esticado se termina exatamente onde a sobra começa', () => {
    // Antes: com dois eventos próximos, o gerador esticava o estudo de ANTES do primeiro evento pra
    // absorver os 10 min de depois dele — um estudo por cima da pausa e do evento. Agora a sobra
    // pequena depois de um bloqueio fica livre.
    const blocks = generateBlocks(cfg({ longBreak: 15, studyWindows: [{ start: '09:00', end: '12:00' }] }), [
      { name: 'A', start: '10:00', end: '10:30', countsAsStudy: false },
      { name: 'B', start: '10:40', end: '11:00', countsAsStudy: false },
    ]);
    expect(resumo(blocks).slice(2, 7)).toEqual([
      '09:30-09:55 estudo', '09:55-10:00 pausa', '10:00-10:30 intervalo', '10:40-11:00 intervalo', '11:00-11:25 estudo',
    ]);
    blocks.forEach((b, i) => {
      const next = blocks[i + 1];
      if (next) expect(next.time >= b.endTime, `${b.time}-${b.endTime} passa por cima de ${next.time}`).toBe(true);
    });
  });
});

describe('generateBlocks — pausas registradas (o timer pausado empurra o dia)', () => {
  const janela = (end: string, pauses: PauseRecord[], events: StudyEvent[] = [], over: Partial<PlannerConfig> = {}) =>
    generateBlocks(cfg({ longBreak: 15, studyWindows: [{ start: '09:00', end }], ...over }), events, pauses);
  const resumo = (blocks: ReturnType<typeof generateBlocks>) =>
    blocks.map((b) => `${b.time}-${b.endTime} ${b.type}${b.mini ? ' mini' : ''}${b.paused ? ` p${b.paused}` : ''}`);

  it('o bloco que contém a pausa fica mais longo, com o mesmo XP; tudo depois desliza', () => {
    const blocks = janela('10:20', [{ at: '09:10', mins: 7 }]);
    expect(resumo(blocks)).toEqual([
      '09:00-09:32 estudo p7', '09:32-09:37 pausa', '09:37-10:02 estudo', '10:02-10:07 pausa', '10:07-10:20 estudo mini',
    ]);
    expect(blocks[0]).toMatchObject({ xp: 50, paused: 7 });
    expect(blockMins(blocks[0]!)).toBe(25);
    expect(blocks[4]).toMatchObject({ xp: 26 }); // o último estudo encolheu pra 13 min
  });

  it('o fim da janela não se move: a pausa no último bloco encurta o estudo', () => {
    const blocks = janela('09:50', [{ at: '09:40', mins: 10 }]);
    expect(resumo(blocks)).toEqual(['09:00-09:25 estudo', '09:25-09:30 pausa', '09:30-09:50 estudo mini p10']);
    expect(blocks[2]).toMatchObject({ xp: 20 }); // 10 min que valem
    expect(blockMins(blocks[2]!)).toBe(10);
  });

  it('um evento fixo corta o bloco empurrado; a pausa que atravessa o evento se dissolve nele', () => {
    const almoco: StudyEvent = { name: '🍽️ Almoço', start: '13:00', end: '14:00', countsAsStudy: false };
    const blocks = generateBlocks(cfg({ longBreak: 15, studyWindows: [{ start: '12:00', end: '15:00' }] }), [almoco], [{ at: '12:40', mins: 10 }]);
    expect(resumo(blocks).slice(0, 5)).toEqual([
      '12:00-12:25 estudo', '12:25-12:30 pausa', '12:30-13:00 estudo p10', '13:00-14:00 intervalo', '14:00-14:25 estudo',
    ]);
    expect(blockMins(blocks[2]!)).toBe(20);
    // Pausa que passa do evento: só o que cabe antes conta como pausa do bloco.
    const cross = generateBlocks(cfg({ longBreak: 15, studyWindows: [{ start: '12:00', end: '15:00' }] }), [almoco], [{ at: '12:50', mins: 15 }]);
    expect(cross[2]).toMatchObject({ time: '12:30', endTime: '13:00', paused: 10, xp: 40 });
  });

  it('duas pausas no mesmo bloco somam; a segunda pode cair no trecho já esticado', () => {
    const blocks = janela('10:20', [{ at: '09:05', mins: 5 }, { at: '09:20', mins: 5 }]);
    expect(blocks[0]).toMatchObject({ time: '09:00', endTime: '09:35', paused: 10, xp: 50 });
  });

  it('pausar a pausa do pomodoro: ela estica, o XP dela não muda, e o estudo seguinte emenda nela', () => {
    const blocks = janela('10:20', [{ at: '09:27', mins: 10 }]);
    expect(blocks[1]).toMatchObject({ time: '09:25', endTime: '09:40', type: 'pausa', paused: 10, xp: 5 });
    expect(blockMins(blocks[1]!)).toBe(5);
    expect(blocks[2]!.time).toBe('09:40');
  });

  it('pausa cedo empurra o dia inteiro contra o fim da janela; o ciclo de 4 pomos não muda', () => {
    const sem = janela('17:30', []);
    const com = janela('17:30', [{ at: '10:00', mins: 20 }]);
    expect(com.filter((b) => b.type === 'estudo').length).toBe(sem.filter((b) => b.type === 'estudo').length - 1);
    expect(com[com.length - 1]).toMatchObject({ endTime: '17:30', type: 'estudo' });
    expect(com.filter((b) => b.name.includes('longa')).map((b) => b.time)).toEqual(['11:15', '13:25', '15:35']);
    for (const b of com) if (b.type === 'estudo' && !b.paused) expect(blockMins(b)).toBeGreaterThanOrEqual(12);
  });

  it('pausa que não cai em estudo/pausa nenhum é ignorada em silêncio', () => {
    const almoco: StudyEvent = { name: 'Almoço', start: '10:00', end: '11:00', countsAsStudy: false };
    expect(janela('12:00', [{ at: '10:20', mins: 10 }], [almoco])).toEqual(janela('12:00', [], [almoco]));
    expect(janela('12:00', [{ at: '13:00', mins: 10 }])).toEqual(janela('12:00', []));
    expect(janela('12:00', [{ at: 'xx', mins: 10 } as PauseRecord, { at: '09:00', mins: 0 }])).toEqual(janela('12:00', []));
  });

  it('a pausa que engole o bloco inteiro contra um limite não emite bloco nenhum', () => {
    const almoco: StudyEvent = { name: 'Almoço', start: '09:01', end: '10:00', countsAsStudy: false };
    // Sobra de 1 min antes do almoço não vira nada; e uma pausa nesse minuto não pode criar um bloco de 0 min.
    const blocks = janela('12:00', [{ at: '09:00', mins: 30 }], [almoco]);
    expect(blocks.every((b) => blockMins(b) > 0)).toBe(true);
  });

  it('nunca produz blocos sobrepostos, com qualquer combinação de pausas e eventos', () => {
    const eventos: StudyEvent[] = [
      { name: 'A', start: '10:00', end: '10:30', countsAsStudy: false },
      { name: 'B', start: '13:00', end: '14:00', countsAsStudy: false },
    ];
    for (const at of ['09:00', '09:12', '09:27', '09:59', '10:31', '12:50', '14:00', '16:55', '17:20']) {
      for (const mins of [1, 5, 13, 30, 90]) {
        const blocks = janela('17:30', [{ at, mins }], eventos);
        blocks.forEach((b, i) => {
          const next = blocks[i + 1];
          if (next) expect(next.time >= b.endTime, `${at}+${mins}: ${b.time}-${b.endTime} invade ${next.time}`).toBe(true);
          expect(blockMins(b), `${at}+${mins}: ${b.time}-${b.endTime} sem duração`).toBeGreaterThan(0);
        });
        expect(blocks[blocks.length - 1]!.type).not.toBe('pausa');
      }
    }
  });
});

describe('generateBlocks — config antiga sem studyWindows', () => {
  it('usa start/end como janela única', () => {
    const antiga: PlannerConfig = {
      start: '08:00',
      end: '12:00',
      pomo: 25,
      shortBreak: 5,
      longBreak: 20,
    };
    const blocks = generateBlocks(antiga);
    expect(blocks[0]!.time).toBe('08:00');
    expect(blocks.some((b) => b.type === 'estudo')).toBe(true);
  });

  it('ignora studyWindows vazio e cai no fallback', () => {
    const blocks = generateBlocks(cfg({ studyWindows: [], start: '08:00', end: '12:00' }));
    expect(blocks[0]!.time).toBe('08:00');
  });
});

describe('calcActualEnd', () => {
  it('devolve o fim do último estudo, não o fim da janela', () => {
    expect(calcActualEnd(cfg({ studyWindows: [{ start: '09:00', end: '10:00' }] }))).toBe(
      '09:55',
    );
  });
});
