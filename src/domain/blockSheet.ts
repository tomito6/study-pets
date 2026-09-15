// A folha do bloco: os fatos de UM bloco do plano, calculados de uma vez pra tela
// mostrar — horário, duração que vale, ciclo, o que entra (ou entrou) de XP e moeda,
// o bônus de skill gravado no check, e o grupo a que ele pertence. Puro.
//
// É o que o botão direito (e o dedo segurado) abrem desde 2026-09-15: o gesto numa
// linha passou a significar "sobre este bloco", e a nota mora aqui dentro porque é um
// dado do bloco como os outros (ver features/plan/BlockSheet.tsx).

import { groupOf } from './groups';
import { coinsForBlock, xpFromCheck } from './progression';
import { blockMins } from './time';
import type { CheckRecord, StudyBlock, StudyGroup, TimeString } from './types';

export interface BlockFacts {
  start: TimeString;
  end: TimeString;
  /** Minutos que valem: fim − início − pausado (ver `blockMins`). */
  mins: number;
  /** Minutos em que o timer ficou pausado dentro do bloco (0 = nenhum). */
  paused: number;
  /** Índice da leva (ver `StudyBlock.cycle`); null em bloqueio. */
  cycle: number | null;
  checked: boolean;
  /** XP e moedas: os que ENTRARAM (com o bônus do check) se marcado; senão os que entram ao concluir. */
  xp: number;
  coins: number;
  /** O bônus de skill gravado no check, em % inteiro (5 = +5%); null sem bônus ou sem check. */
  bonusPct: number | null;
  group: StudyGroup | null;
}

export function blockFacts(block: StudyBlock, check: CheckRecord | undefined, groups: StudyGroup[]): BlockFacts {
  const mins = blockMins(block);
  const bonus = check && check !== true && check.bonus ? check.bonus : 0;
  return {
    start: block.time,
    end: block.endTime,
    mins,
    paused: block.paused ?? 0,
    cycle: block.cycle ?? null,
    checked: !!check,
    xp: check ? xpFromCheck(block, check) : block.xp,
    coins: coinsForBlock(block, mins),
    bonusPct: bonus > 0 ? Math.round(bonus * 100) : null,
    group: groupOf(groups, block),
  };
}
