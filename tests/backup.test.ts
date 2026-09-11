// A rede de segurança e o caminho de volta.
//
// O app baixava um JSON e não sabia lê-lo: quem baixasse e depois apagasse ficava com um
// arquivo inútil. E "baixe seus dados antes de apagar" é jogar no usuário uma
// responsabilidade que é do app. Estes testes cobrem as duas metades do conserto.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activeSafetyNet, discardSafetyNet, dropExpiredSafetyNet, importBackupFile, restoreSafetyNet, takeSafetyNet } from '../src/application/backup';
import { buildExport } from '../src/application/export';
import { rebuildWeeks } from '../src/application/plan';
import { cancelSession } from '../src/application/settings';
import { SAFETY_NET_DAYS, parseSafetyNet, readBackup, safetyNetDaysLeft } from '../src/domain/backup';
import { emptyPersistedState, hydrateUserDoc, serializeState } from '../src/domain/persistence';
import { state } from '../src/store/store';

const AGORA = new Date('2026-09-11T14:00:00');
const DIA = 86_400_000;

/** Uma conta com história: o que não pode sumir sem volta. */
function comHistorico(): void {
  state.checks = { '2026-09-01': { '09:00': { pet: 'dog', bonus: 0 } } };
  state.coinsSpent = 150;
  state.groups = { '2026-09-01': [{ id: 'g1', start: '09:00', end: '11:00', name: 'Análise II', goal: 'lista 3' }] };
  state.pets = { ...state.pets, owned: [{ id: 'dog', species: 'dog', name: 'Bolt', xp: 400, path: null, stage: 0, skill: 'fiel', skillActivatedAt: 0, adoptedAt: 0 }] };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), {
    user: { uid: 'tomi', displayName: null, email: null },
    uiWeek: 1,
    uiDay: 2,
  });
  state.config.periodStart = '2026-08-01';
  rebuildWeeks(AGORA);
});

describe('readBackup — o portão contra o arquivo errado', () => {
  it('aceita um arquivo gerado pelo próprio app', () => {
    comHistorico();
    const arquivo = JSON.stringify(buildExport(AGORA));
    const lido = readBackup(arquivo);
    expect(lido.ok).toBe(true);
    if (lido.ok) expect(hydrateUserDoc(lido.doc).coinsSpent).toBe(150);
  });

  it('recusa com motivo o que não é backup — e esse portão é o que evita apagar tudo', () => {
    // Sem ele, `hydrateUserDoc` (que é tolerante de propósito) devolveria estado VAZIO pra
    // qualquer porcaria, e o save seguinte gravaria o vazio por cima do histórico real.
    expect(readBackup('')).toEqual({ ok: false, reason: 'vazio' });
    expect(readBackup('   ')).toEqual({ ok: false, reason: 'vazio' });
    expect(readBackup('não é json')).toEqual({ ok: false, reason: 'nao-e-json' });
    expect(readBackup('[1,2,3]')).toEqual({ ok: false, reason: 'nao-e-do-study-pets' });
    expect(readBackup('{"foto":"praia.jpg"}')).toEqual({ ok: false, reason: 'nao-e-do-study-pets' });
    expect(readBackup('{}')).toEqual({ ok: false, reason: 'nao-e-do-study-pets' });
  });
});

describe('a rede de segurança', () => {
  it('apagar o histórico deixa de ser definitivo', () => {
    comHistorico();
    cancelSession(AGORA);

    expect(state.checks, 'o histórico não foi apagado').toEqual({});
    expect(state.coinsSpent).toBe(0);
    const rede = activeSafetyNet(AGORA);
    expect(rede, 'não sobrou rede de segurança').not.toBeNull();

    expect(restoreSafetyNet(AGORA)).toEqual({ ok: true });
    expect(state.coinsSpent, 'as moedas não voltaram').toBe(150);
    expect(state.checks['2026-09-01']?.['09:00']).toBeTruthy();
    expect(state.groups['2026-09-01']?.[0]?.name).toBe('Análise II');
    expect(state.pets.owned[0]?.name).toBe('Bolt');
  });

  it('restaurar consome a rede — e não sobra cópia dentro de cópia', () => {
    comHistorico();
    cancelSession(AGORA);
    restoreSafetyNet(AGORA);
    expect(state.safetyNet, 'a rede sobreviveu à restauração').toBeNull();
    expect(activeSafetyNet(AGORA)).toBeNull();
    expect(restoreSafetyNet(AGORA)).toEqual({ ok: false, reason: 'sem-rede' });
  });

  it('a cópia guardada não contém outra cópia dentro', () => {
    // Sem isso, o documento ganharia uma camada a cada apagamento.
    comHistorico();
    cancelSession(AGORA);
    const rede = parseSafetyNet(state.safetyNet);
    expect(rede?.doc.safetyNet, 'a cópia levou outra cópia junto').toBeNull();
  });

  it('vence em 30 dias, e some sozinha no primeiro acesso depois disso', () => {
    comHistorico();
    cancelSession(AGORA);

    const quase = new Date(AGORA.getTime() + (SAFETY_NET_DAYS - 1) * DIA);
    expect(activeSafetyNet(quase), 'venceu antes da hora').not.toBeNull();
    expect(safetyNetDaysLeft(parseSafetyNet(state.safetyNet)!, quase), 'faltando um dia, o texto diz "amanhã"').toBe(1);
    const ultimoDia = new Date(AGORA.getTime() + SAFETY_NET_DAYS * DIA - 1000);
    expect(safetyNetDaysLeft(parseSafetyNet(state.safetyNet)!, ultimoDia), 'no último dia o texto diz "hoje"').toBe(0);

    const depois = new Date(AGORA.getTime() + (SAFETY_NET_DAYS + 1) * DIA);
    expect(activeSafetyNet(depois)).toBeNull();
    expect(restoreSafetyNet(depois)).toEqual({ ok: false, reason: 'vencida' });
    expect(state.safetyNet, 'a cópia vencida continuou no documento').toBeNull();
  });

  it('dropExpiredSafetyNet limpa no boot, e não mexe no que ainda vale', () => {
    comHistorico();
    cancelSession(AGORA);
    expect(dropExpiredSafetyNet(new Date(AGORA.getTime() + DIA))).toBe(false);
    expect(state.safetyNet).not.toBeNull();
    expect(dropExpiredSafetyNet(new Date(AGORA.getTime() + (SAFETY_NET_DAYS + 1) * DIA))).toBe(true);
    expect(state.safetyNet).toBeNull();
  });

  it('dá pra descartar na hora, sem esperar o prazo', () => {
    comHistorico();
    cancelSession(AGORA);
    discardSafetyNet();
    expect(activeSafetyNet(AGORA)).toBeNull();
  });

  it('a rede fica de fora do arquivo baixado', () => {
    // Senão o download dobraria de tamanho carregando o histórico que a pessoa apagou.
    comHistorico();
    cancelSession(AGORA);
    expect(buildExport(AGORA).safetyNet).toBeNull();
  });

  it('o instantâneo é do estado inteiro, não de uma lista de campos', () => {
    comHistorico();
    state.tutorialSeen = { plan: true };
    const rede = takeSafetyNet(AGORA);
    for (const campo of Object.keys(serializeState(state))) {
      if (campo === 'safetyNet') continue;
      expect(campo in rede.doc, `o campo "${campo}" ficou de fora da cópia`).toBe(true);
    }
  });
});

describe('importar um arquivo', () => {
  const arquivoCom = (texto: string): Blob => ({ text: () => Promise.resolve(texto) }) as unknown as Blob;

  it('um JSON baixado volta a ser o plano', async () => {
    comHistorico();
    const baixado = JSON.stringify(buildExport(AGORA));

    Object.assign(state, emptyPersistedState()); // como se fosse outro aparelho, do zero
    expect(state.coinsSpent).toBe(0);

    expect(await importBackupFile(arquivoCom(baixado), AGORA)).toEqual({ ok: true });
    expect(state.coinsSpent).toBe(150);
    expect(state.pets.owned[0]?.name).toBe('Bolt');
  });

  it('arquivo errado não encosta no que já existe', async () => {
    comHistorico();
    const r = await importBackupFile(arquivoCom('{"foto":"praia.jpg"}'), AGORA);
    expect(r).toEqual({ ok: false, reason: 'nao-e-do-study-pets' });
    expect(state.coinsSpent, 'o histórico foi mexido por um arquivo recusado').toBe(150);
  });

  it('sem arquivo e sem usuário, recusa com motivo', async () => {
    expect(await importBackupFile(null, AGORA)).toEqual({ ok: false, reason: 'sem-arquivo' });
    state.user = null;
    expect(await importBackupFile(arquivoCom('{}'), AGORA)).toEqual({ ok: false, reason: 'sem-usuario' });
  });
});

describe('o que a rede NÃO cobre', () => {
  it('apagar a conta continua sendo definitivo — a promessa da política de privacidade', () => {
    // Guardar uma cópia escondida de quem pediu para ser esquecido quebraria o art. 17 e a
    // frase que está escrita em public/legal/privacidade.html. A rede é só do histórico.
    const fonte = ['src/application/account.ts'].map((f) =>
      readFileSyncSeguro(new URL(`../${f}`, import.meta.url)),
    );
    for (const texto of fonte) {
      expect(texto, 'o fluxo de apagar conta passou a criar rede de segurança').not.toContain('takeSafetyNet');
      expect(texto).not.toContain('safetyNet');
    }
  });
});

function readFileSyncSeguro(url: URL): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('node:fs').readFileSync(url, 'utf8');
}
