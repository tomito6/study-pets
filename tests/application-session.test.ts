// O boot do login, e a trava que faltava.
//
// O app salva com `setDoc` sem merge — o documento inteiro, sempre. Isso torna a
// leitura do boot crítica de um jeito que não é óbvio: se ela falha e o app segue
// rodando, o `state` em memória ainda é o estado vazio do módulo (ou o resto da
// conta anterior), e o primeiro save grava esse vazio por cima do histórico de
// verdade, com ack do servidor e sem desfazer. Não precisa nem de clique: o
// `resumeHardcoreOnBoot` cobra a penalidade e chama `saveNow()` dentro do boot.
//
// Nenhum destes caminhos tinha teste.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { blockSaves, saveNow } from '../src/application/save';
import { rebuildWeeks } from '../src/application/plan';
import { loadUserData } from '../src/application/session';
import { emptyPersistedState } from '../src/domain/persistence';
import { users } from '../src/infrastructure';
import { derived, state } from '../src/store/store';

const AGORA = new Date('2026-09-02T17:30:00');

/** O documento de quem já usa o app há meses — o que não pode ser perdido. */
const docDeVerdade = {
  ...emptyPersistedState(),
  schemaVersion: 4,
  coinsSpent: 150,
  checks: { '2026-08-20': { '09:00': { pet: 'dog', bonus: 0 } } },
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), {
    user: { uid: 'tomi', displayName: null, email: null },
    uiWeek: 1,
    uiDay: 2,
  });
  derived.loadFailed = false;
  derived.weeks = [];
  rebuildWeeks(AGORA);
  blockSaves(false);
});

describe('loadUserData quando a leitura falha', () => {
  it('não deixa nada ser salvo por cima do documento que já existe', async () => {
    await users.save('tomi', docDeVerdade as never);
    vi.spyOn(users, 'load').mockRejectedValueOnce(new Error('offline'));

    expect(await loadUserData('tomi', AGORA)).toBe('failed');
    expect(derived.loadFailed).toBe(true);

    // O caminho de zero interação: a penalidade do hardcore salva sozinha no boot.
    const escrever = vi.spyOn(users, 'save');
    await saveNow();
    expect(escrever).not.toHaveBeenCalled();

    // E o que está no servidor continua inteiro.
    expect(await users.load('tomi')).toMatchObject({ coinsSpent: 150 });
  });

  it('não herda o estado da conta anterior — nenhum campo', async () => {
    // A pessoa A sai e a pessoa B entra no mesmo navegador. `eventSeries` é onde
    // moram as aulas e consultas importadas de um .ics: o campo mais sensível dos
    // cinco que o reset antigo esquecia.
    Object.assign(state, {
      eventSeries: [{ id: 'ser_aula', name: 'Consulta médica', start: '14:00', end: '15:00', weekdays: [1], freq: 'weekly', anchor: null, until: null, exceptions: [], countsAsStudy: false }],
      groups: { '2026-08-20': [{ id: 'g1', start: '09:00', end: '11:00', name: 'Análise II', goal: 'lista 3' }] },
      windowOverrides: { '2026-08-20': { studyWindows: [{ start: '10:00', end: '12:00' }] } },
      tutorialSeen: { plan: true },
      coinsSpent: 999,
    });

    // É o que o boot faz: state.user já é quem está entrando quando o load começa.
    state.user = { uid: 'pessoa-b', displayName: null, email: null };
    vi.spyOn(users, 'load').mockRejectedValueOnce(new Error('offline'));
    await loadUserData('pessoa-b', AGORA);

    const vazio = emptyPersistedState();
    for (const campo of Object.keys(vazio) as (keyof typeof vazio)[]) {
      expect(state[campo], `o campo "${campo}" ficou com resíduo da conta anterior`).toEqual(vazio[campo]);
    }
  });
});

describe('o load que volta atrasado', () => {
  // O await de users.load é uma janela de rede, e nela o app já está na tela com o
  // botão Sair. Dá tempo de sair, entrar com outra conta, e a resposta antiga voltar
  // depois. Como o save substitui o documento inteiro, sem esta guarda o primeiro
  // check da segunda pessoa gravava o histórico da primeira no documento dela.
  it('não escreve no estado quando a sessão já é de outra pessoa', async () => {
    let entregarA: (doc: unknown) => void = () => {};
    vi.spyOn(users, 'load').mockImplementationOnce(
      () => new Promise((resolve) => { entregarA = resolve; }),
    );
    const carregandoA = loadUserData('pessoa-a', AGORA);

    // A pessoa B assume a sessão enquanto o load de A está pendurado.
    await users.save('pessoa-b', { ...docDeVerdade, coinsSpent: 42 } as never);
    state.user = { uid: 'pessoa-b', displayName: null, email: null };
    expect(await loadUserData('pessoa-b', AGORA)).toBe('loaded');
    expect(state.coinsSpent).toBe(42);

    // Só agora a resposta de A chega.
    entregarA({ ...docDeVerdade, coinsSpent: 150 });
    expect(await carregandoA).toBe('stale');
    expect(state.coinsSpent, 'o documento de A entrou na sessão de B').toBe(42);

    // E o save de B continua livre — o load de A não podia travá-lo.
    const escrever = vi.spyOn(users, 'save');
    await saveNow();
    expect(escrever).toHaveBeenCalledWith('pessoa-b', expect.objectContaining({ coinsSpent: 42 }));
  });

  it('uma falha atrasada não derruba a sessão de quem carregou direito', async () => {
    let derrubarA: (e: unknown) => void = () => {};
    vi.spyOn(users, 'load').mockImplementationOnce(
      () => new Promise((_, reject) => { derrubarA = reject; }),
    );
    const carregandoA = loadUserData('pessoa-a', AGORA);

    await users.save('pessoa-b', { ...docDeVerdade, coinsSpent: 42 } as never);
    state.user = { uid: 'pessoa-b', displayName: null, email: null };
    await loadUserData('pessoa-b', AGORA);

    derrubarA(new Error('offline'));
    expect(await carregandoA).toBe('stale');
    expect(derived.loadFailed, 'a falha de A jogou B na tela de erro').toBe(false);
    expect(state.coinsSpent).toBe(42);

    const escrever = vi.spyOn(users, 'save');
    await saveNow();
    expect(escrever, 'a falha de A travou o save de B').toHaveBeenCalledTimes(1);
  });
});

describe('loadUserData no caminho feliz', () => {
  it('destrava o save — conta nova e conta existente', async () => {
    blockSaves(true);
    state.user = { uid: 'conta-nova', displayName: null, email: null };
    expect(await loadUserData('conta-nova', AGORA)).toBe('new');
    const escrever = vi.spyOn(users, 'save');
    await saveNow();
    expect(escrever).toHaveBeenCalledTimes(1);

    await users.save('tomi', docDeVerdade as never);
    blockSaves(true);
    state.user = { uid: 'tomi', displayName: null, email: null };
    expect(await loadUserData('tomi', AGORA)).toBe('loaded');
    expect(state.coinsSpent).toBe(150);
    expect(derived.loadFailed).toBe(false);
    await saveNow();
    expect(escrever).toHaveBeenCalledTimes(3); // a preparação + o save de agora
  });
});

describe('sair da conta', () => {
  it('zera o estado inteiro, e não uma lista de campos escrita à mão', () => {
    // Guarda contra a volta do bug: a lista manual esquecia eventSeries, groups,
    // windowOverrides, avatar e tutorialSeen, e ninguém percebia ao acrescentar um
    // campo novo ao documento. `emptyPersistedState` é a mesma função que define o
    // que uma conta nova tem — usá-la é o que torna o esquecimento impossível.
    const fonte = readFileSync(new URL('../src/application/session.ts', import.meta.url), 'utf8');
    const corpo = fonte.slice(fonte.indexOf('function resetToLoggedOut'));
    const fim = corpo.indexOf('\n}');
    expect(corpo.slice(0, fim)).toContain('emptyPersistedState()');
  });
});
