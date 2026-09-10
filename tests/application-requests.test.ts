// Os dois "pedidos" que a tela grande manda pra outro componente atender: o
// Iniciar do cartão Agora (a barra do laptop não pode iniciar direto, senão furava
// o consentimento do hardcore — quem atende é o PlanTab) e o Abrir Configurações
// da barra de cima (quem é dona do "aberta ou fechada" é a SettingsPage).
//
// O contrato é de caixa de correio: põe o pedido e avisa; quem atende limpa. Limpar
// duas vezes não pode virar um notify a mais — a lista inteira re-renderiza a cada um.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rebuildWeeks } from '../src/application/plan';
import { clearSettingsRequest, requestSettings } from '../src/application/settings';
import { clearStartRequest, requestStartBlock } from '../src/application/timer';
import { emptyPersistedState } from '../src/domain/persistence';
import type { StudyBlock } from '../src/domain/types';
import { derived, state, subscribe } from '../src/store/store';

const AGORA = new Date('2026-09-02T10:10:00');
const bloco: StudyBlock = { time: '10:00', endTime: '10:25', name: '📖 Estudo 3', type: 'estudo', xp: 50, cycle: 0 };

beforeEach(() => {
  Object.assign(state, emptyPersistedState(), { uiWeek: 1, uiDay: 2 });
  derived.timerBlock = null;
  derived.focusOpen = false;
  derived.startRequest = null;
  derived.settingsRequest = null;
  rebuildWeeks(AGORA);
});

describe('Iniciar pedido de fora da lista (o cartão Agora do laptop)', () => {
  it('guarda o bloco e avisa a tela, sem iniciar nada por conta própria', () => {
    const cb = vi.fn();
    const off = subscribe(cb);

    requestStartBlock(bloco);

    expect(derived.startRequest).toBe(bloco);
    expect(cb).toHaveBeenCalled();
    // quem inicia é o PlanTab: aqui o timer não pode ter saído do lugar
    expect(derived.timerBlock).toBeNull();
    expect(derived.focusOpen).toBe(false);
    off();
  });

  it('atendido, o pedido some — e limpar de novo não re-renderiza à toa', () => {
    requestStartBlock(bloco);
    const cb = vi.fn();
    const off = subscribe(cb);

    clearStartRequest();
    expect(derived.startRequest).toBeNull();
    expect(cb).toHaveBeenCalledTimes(1);

    clearStartRequest();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('um pedido novo substitui o anterior que ninguém atendeu', () => {
    const outro: StudyBlock = { ...bloco, time: '10:30', endTime: '10:55', name: '📖 Estudo 4' };
    requestStartBlock(bloco);
    requestStartBlock(outro);
    expect(derived.startRequest).toBe(outro);
  });
});

describe('Abrir Configurações pedido pela barra do laptop', () => {
  it('levanta a flag e avisa a tela', () => {
    const cb = vi.fn();
    const off = subscribe(cb);

    requestSettings();

    expect(derived.settingsRequest).toEqual({ focus: null });
    expect(cb).toHaveBeenCalled();
    off();
  });

  it('atendido, a flag baixa — e baixar de novo não reabre nem re-renderiza', () => {
    requestSettings();
    const cb = vi.fn();
    const off = subscribe(cb);

    clearSettingsRequest();
    expect(derived.settingsRequest).toBeNull();
    expect(cb).toHaveBeenCalledTimes(1);

    clearSettingsRequest();
    expect(derived.settingsRequest).toBeNull();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('os dois pedidos são independentes: um não mexe no outro', () => {
    requestSettings();
    requestStartBlock(bloco);
    clearSettingsRequest();
    expect(derived.startRequest).toBe(bloco);

    requestSettings();
    clearStartRequest();
    expect(derived.settingsRequest).toEqual({ focus: null });
  });
});
