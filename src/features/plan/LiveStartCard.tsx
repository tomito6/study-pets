// O BOTÃO do dia ao vivo: o "um botão só" do modo, literalmente. Um botão cheio na largura
// toda, "▶ Começar" (ou "▶ Voltar") com a duração do bloco num selo translúcido dentro dele;
// depois de uma parada, uma linha miúda embaixo com o placar e a hora.
//
// É o esboço 1b de `prototypes/comecar-4-esbocos.html` + `prototypes/comecar-ritmo.html`,
// escolhido pelo Tomi em 2026-09-14 depois de duas rodadas: o cartaz original (269px), o
// cartão compacto (150px) e a faixa com "25 · 5 · 20 min" (66px) foram ficando pra trás —
// "o que mais incomoda são os numerozinhos". O selo diz só "25 min"; o ritmo inteiro mora
// na porta do "⏱ Ao vivo" (Ritmo … Mudar →), que não precisa ser repetida aqui.
// Ele não é a tela do modo (num dia ao vivo quem está na frente é o foco): é o primeiro
// toque do dia, e a porta de volta depois de uma parada.

import { blocksForDay } from '../../application/plan';
import { isChecked } from '../../domain/checks';
import { blockMins, dk } from '../../domain/time';
import type { StudyBlock } from '../../domain/types';
import { formatCompact } from '../../domain/settings';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';

const t = strings.plan.liveStart;

interface Props {
  dateKey: string;
  /**
   * O Plano é quem abre a corrida e põe o bloco no timer — é ele que é dono do
   * consentimento do hardcore, e a corrida só pode ser gravada DEPOIS dele: gravar
   * antes deixava um bloco fantasma no plano quando a pessoa cancelava.
   */
  onStart: (at: Date) => void;
}

export function LiveStartCard({ dateKey, onStart }: Props) {
  const { pomo, checks, override } = useAppState((s) => ({ pomo: s.config.pomo, checks: s.checks, override: s.windowOverrides[dateKey] }));
  const blocos = blocksForDay(dateKey);
  const estudos = blocos.filter((b) => b.type === 'estudo');
  // O dia já teve corrida? A régua é ESTUDO, não "tem bloco": a refeição das 13h existe num
  // dia que nunca começou. E o que já rolou conta por CHECK, não por bloco: um bloco aparado
  // sem check (o ✕ da barra, um reload) não é pomodoro feito.
  const jaRodou = estudos.length > 0;
  const feitos = estudos.filter((b) => isChecked(checks, dateKey, b.time));
  const minutos = feitos.reduce((soma, b) => soma + blockMins(b), 0);
  // Quando parou: o fim da última corrida do dia (a janela `live` que termina mais tarde).
  const parouAs = (override?.studyWindows ?? []).filter((w) => w.live).reduce<string | null>((m, w) => (m === null || w.end > m ? w.end : m), null);

  return (
    <div className="live-start" id="live-start">
      <button type="button" className="lv-btn" id="live-start-btn" onClick={() => onStart(new Date())}>
        <span className="lv-label">{jaRodou ? t.back : t.start}</span>
        <span className="lv-chip" id="live-rhythm">{t.rhythmValue(pomo)}</span>
      </button>
      {feitos.length > 0 && (
        <div className="lv-tally" id="live-tally">
          {t.tally(feitos.length, formatCompact(minutos))}
          {parouAs ? ` · ${t.stoppedAt(parouAs)}` : ''}
        </div>
      )}
    </div>
  );
}

/** O cartão aparece? Só em dia ao vivo de hoje, com nada rodando. */
export const showLiveStart = (mode: string, dateKey: string, timerBlock: StudyBlock | null, now: Date): boolean =>
  mode === 'live' && dateKey === dk(now) && !timerBlock;
