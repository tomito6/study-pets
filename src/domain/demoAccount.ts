// O PERSONAGEM PRONTO do site de teste (a prévia publicada de cada PR — ver "O site de
// teste" no CLAUDE.md): uma conta que já passou pelo onboarding e pelos tours, com um pet
// e duas semanas de histórico, pra abrir o link e cair direto no que se quer testar.
//
// É um ESTADO, não um atalho: sai daqui o mesmo `PersistedState` que o app salvaria, e
// tudo que aparece na tela (XP, nível, moedas, sequência, nível do pet, o sininho) é
// calculado pelo app a partir dele, pelos caminhos de sempre. Por isso os checks são
// tirados do plano que o gerador monta pra cada dia — check em horário que não existe
// seria XP que não aparece.
//
// Puro e determinístico: o mesmo `now` devolve o mesmo personagem. As datas são relativas
// a hoje, senão o histórico envelheceria e a sequência nasceria quebrada.

import { DEFAULT_AVATAR } from './avatar';
import { DEFAULT_CFG } from './config';
import { mealSeries } from './eventPresets';
import { expandEventsForDate } from './events';
import { PETS, newPetInstance } from './pets';
import { emptyPersistedState } from './persistence';
import type { PersistedState } from './persistence';
import { generateBlocks } from './planner';
import { dk } from './time';
import { TOUR_AREAS } from './tutorial';
import type { TutorialSeen } from './tutorial';
import type { CheckRecord, PetId } from './types';

export const DEMO_PET: { species: PetId; name: string } = { species: 'cat', name: 'Mia' };

/**
 * Quantos estudos foram feitos em cada dia, de ONTEM pra trás. Hoje fica em branco: é o
 * dia em que se testa. O zero é de propósito — um dia que falhou, como todo histórico de
 * verdade tem —, e fica longe o bastante de ontem pra sequência atual existir (3 dias).
 */
export const DEMO_STUDIES_PER_DAY: readonly number[] = [6, 8, 3, 0, 7, 5, 9, 4, 6, 0, 8, 7, 2, 5];

const daysBefore = (now: Date, n: number): Date => {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0); // meio-dia: tirar dias não escorrega na troca de horário de verão
  d.setDate(d.getDate() - n);
  return d;
};

export function demoAccount(now: Date): PersistedState {
  const s = emptyPersistedState();
  const dias = DEMO_STUDIES_PER_DAY.length;
  const comeco = daysBefore(now, dias);

  s.config = { ...DEFAULT_CFG, studyWindows: DEFAULT_CFG.studyWindows.map((w) => ({ ...w })), periodStart: dk(comeco) };
  // A refeição das 13h, como toda conta que sai do onboarding.
  s.eventSeries = [mealSeries('13:00', 60)];
  s.avatar = { ...DEFAULT_AVATAR };
  s.ageConfirmed = true;
  s.tutorialSeen = Object.fromEntries(TOUR_AREAS.map((a) => [a, true])) as TutorialSeen;

  const adotado = comeco.getTime();
  const pet = newPetInstance(PETS[DEMO_PET.species], DEMO_PET.name, [], adotado);
  s.pets = {
    owned: [pet],
    active: pet.id,
    activeSince: adotado,
    // Um dia ANTES do começo: o boot credita o histórico inteiro no pet pelo caminho de
    // sempre (`applyPendingPetXP`). Com `null` ele trataria a conta como recém-migrada e
    // não creditaria nada.
    xpProcessedUntil: dk(daysBefore(now, dias + 1)),
  };

  const marcado: CheckRecord = { pet: pet.id, bonus: 0 };
  DEMO_STUDIES_PER_DAY.forEach((estudos, i) => {
    if (estudos === 0) return;
    const dia = dk(daysBefore(now, i + 1));
    const plano = generateBlocks(s.config, expandEventsForDate(dia, s.events, s.eventSeries));
    const checks: Record<string, CheckRecord> = {};
    let feitos = 0;
    for (const b of plano) {
      if (feitos >= estudos) break;
      // As pausas entre os estudos feitos entram junto, como num dia vivido no foco.
      if (b.type !== 'estudo' && b.type !== 'pausa') continue;
      checks[b.time] = { ...marcado };
      if (b.type === 'estudo') feitos++;
    }
    s.checks[dia] = checks;
  });

  return s;
}
