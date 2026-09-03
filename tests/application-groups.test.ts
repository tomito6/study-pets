import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addGroup, canEditGroups, deleteGroup, groupsForDay, updateGroup, validateGroup } from '../src/application/groups';
import { clearBlockCache, rebuildWeeks } from '../src/application/plan';
import { cancelSession } from '../src/application/settings';
import { emptyPersistedState } from '../src/domain/persistence';
import { dateFromKey } from '../src/domain/time';
import { derived, state } from '../src/store/store';

const AGORA = new Date('2026-09-02T17:30:00'); // quarta
const HOJE = '2026-09-02';
const AMANHA = '2026-09-03';

// Config padrão: pomo 25 / pausa 5 a partir das 09:00 → 09:00–09:25 estudo, 09:25–09:30 pausa, ...
const manha = { start: '09:00', end: '10:25', name: 'Análise II', goal: 'lista 3' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.weeks = [];
  clearBlockCache();
  rebuildWeeks(AGORA);
});

describe('criar', () => {
  it('entra no dia com id, nome e objetivo limpos', () => {
    const r = addGroup(HOJE, { ...manha, name: '  Análise II ', goal: ' lista 3 ' });
    expect(r.ok).toBe(true);
    expect(groupsForDay(HOJE)).toEqual([
      { id: expect.stringMatching(/^grp_/), start: '09:00', end: '10:25', name: 'Análise II', goal: 'lista 3' },
    ]);
  });

  it('nome vazio vira "Grupo"', () => {
    addGroup(HOJE, { ...manha, name: '   ' });
    expect(groupsForDay(HOJE)[0]!.name).toBe('Grupo');
  });

  it('fica ordenado por início, independente da ordem de criação', () => {
    addGroup(HOJE, { start: '14:00', end: '15:00', name: 'tarde', goal: '' });
    addGroup(HOJE, manha);
    expect(groupsForDay(HOJE).map((g) => g.name)).toEqual(['Análise II', 'tarde']);
  });

  it('recusa trecho sem estudo e trecho em cima de outro grupo', () => {
    expect(addGroup(HOJE, { start: '09:25', end: '09:30', name: 'só pausa', goal: '' })).toEqual({ ok: false, reason: 'no-study' });
    addGroup(HOJE, manha);
    expect(addGroup(HOJE, { start: '10:00', end: '11:00', name: 'x', goal: '' })).toEqual({ ok: false, reason: 'overlap' });
    expect(groupsForDay(HOJE)).toHaveLength(1);
  });

  it('dia encerrado é somente leitura; dia futuro pode (planejar é o ponto)', () => {
    state.closedDays[HOJE] = true;
    expect(canEditGroups(HOJE)).toBe(false);
    expect(addGroup(HOJE, manha)).toEqual({ ok: false, reason: 'closed' });
    expect(addGroup(AMANHA, manha).ok).toBe(true);
  });

  it('validateGroup olha o plano do dia e os grupos já existentes', () => {
    expect(validateGroup(HOJE, { start: '09:00', end: '10:25' })).toEqual({ ok: true });
    addGroup(HOJE, manha);
    expect(validateGroup(HOJE, { start: '09:00', end: '10:25' })).toEqual({ ok: false, reason: 'overlap' });
    expect(validateGroup(HOJE, { start: '09:00', end: '10:25' }, groupsForDay(HOJE)[0]!.id)).toEqual({ ok: true });
  });
});

describe('editar e apagar', () => {
  it('updateGroup troca nome e objetivo mantendo o id', () => {
    const { group } = addGroup(HOJE, manha) as { ok: true; group: { id: string } };
    const r = updateGroup(HOJE, group.id, { ...manha, name: 'Análise II · revisão', goal: '' });
    expect(r.ok).toBe(true);
    expect(groupsForDay(HOJE)).toEqual([{ id: group.id, start: '09:00', end: '10:25', name: 'Análise II · revisão', goal: '' }]);
  });

  it('updateGroup muda o trecho, e recusa se invadir outro grupo', () => {
    const { group } = addGroup(HOJE, manha) as { ok: true; group: { id: string } };
    addGroup(HOJE, { start: '14:00', end: '15:00', name: 'tarde', goal: '' });
    expect(updateGroup(HOJE, group.id, { ...manha, end: '10:55' }).ok).toBe(true);
    expect(groupsForDay(HOJE)[0]).toMatchObject({ id: group.id, start: '09:00', end: '10:55' });
    expect(updateGroup(HOJE, group.id, { ...manha, end: '14:30' })).toEqual({ ok: false, reason: 'overlap' });
    expect(groupsForDay(HOJE)[0]!.end).toBe('10:55');
  });

  it('updateGroup de id desconhecido não faz nada', () => {
    addGroup(HOJE, manha);
    expect(updateGroup(HOJE, 'grp_nope', manha)).toEqual({ ok: false, reason: 'not-found' });
  });

  it('deleteGroup remove e limpa o dia quando fica vazio', () => {
    const { group } = addGroup(HOJE, manha) as { ok: true; group: { id: string } };
    expect(deleteGroup(HOJE, group.id)).toBe(true);
    expect(state.groups[HOJE]).toBeUndefined();
    expect(deleteGroup(HOJE, group.id)).toBe(false);
  });

  it('nada disso mexe no plano: config e eventos continuam os mesmos', () => {
    const antes = JSON.stringify(state.config);
    addGroup(HOJE, manha);
    expect(JSON.stringify(state.config)).toBe(antes);
    expect(state.events).toEqual({});
  });
});

describe('integração com o resto', () => {
  it('grupo em dia futuro conta como dado: as semanas se estendem até ele', () => {
    state.groups['2027-01-15'] = [{ id: 'g', start: '09:00', end: '10:00', name: 'x', goal: '' }];
    rebuildWeeks(AGORA);
    const ultima = derived.weeks[derived.weeks.length - 1]!;
    expect(ultima.end.getTime()).toBeGreaterThanOrEqual(dateFromKey('2027-01-15').getTime());
  });

  it('cancelar sessão zera os grupos junto com o resto', () => {
    addGroup(HOJE, manha);
    cancelSession();
    expect(state.groups).toEqual({});
  });
});
