// O cartão que ocupa o lugar da lista num dia AO VIVO: o "um botão só" do modo.
//
// Ele não herda a caixa tracejada do dia vazio de propósito — pontilhado lê como
// ausência, e isto é um começo. E ele não é a tela do modo: num dia ao vivo o relógio
// corre a maior parte do tempo, e aí quem está na frente é o foco. Este cartão é o
// primeiro toque do dia, e a porta de volta depois de uma parada.

import { startLive } from '../../application/live';
import { blocksForDay } from '../../application/plan';
import { blockMins, dk } from '../../domain/time';
import type { StudyBlock } from '../../domain/types';
import { formatCompact } from '../../domain/settings';
import { strings } from '../../shared/strings';
import { requestSettings } from '../../application/settings';
import { showToast } from '../../shared/toast';
import { useAppState } from '../../store/store';

const t = strings.plan.liveStart;

interface Props {
  dateKey: string;
  /** O Plano é quem põe o bloco no timer — é ele que é dono do consentimento do hardcore. */
  onStart: (block: StudyBlock, at: Date) => void;
}

export function LiveStartCard({ dateKey, onStart }: Props) {
  const { pomo, shortBreak, longBreak } = useAppState((s) => s.config);
  const blocos = blocksForDay(dateKey);
  const estudos = blocos.filter((b) => b.type === 'estudo');
  // O dia já teve corrida? A régua é ESTUDO, não "tem bloco": desde que o dia ao vivo
  // mostra os compromissos antes de começar (a refeição das 13h, que toda conta tem),
  // `blocos.length > 0` é verdade num dia que nunca começou — e o cartão dizia
  // "▶ Voltar" e "0 pomodoros" pra quem ainda não tinha apertado nada.
  // A hora em que parou não é dita aqui: ela é o fim do último bloco da lista, logo
  // acima do cartão, e repetir seria contar duas vezes.
  const jaRodou = estudos.length > 0;
  const minutos = estudos.reduce((soma, b) => soma + blockMins(b), 0);

  const comecar = (): void => {
    const agora = new Date();
    const r = startLive(dateKey, agora);
    if (!r.ok) {
      showToast(t.refusal(r.reason));
      return;
    }
    onStart(r.block, agora);
  };

  return (
    <div className="live-start" id="live-start">
      <div className="ls-kicker">{jaRodou ? t.kickerDone(estudos.length, formatCompact(minutos)) : t.kicker}</div>
      <div className="ls-title">{t.title}</div>
      <button type="button" className="ls-btn" id="live-start-btn" onClick={comecar}>
        {jaRodou ? t.back : t.start}
      </button>
      {/* O único lugar do app, fora das Configurações, que NOMEIA o ritmo — e o cartão
          acabou de pedir pra pessoa escolher um. Então ele também é porta: mesma da
          "🕘 Janelas do dia" (ver CLAUDE.md, "O ritmo tem porta"). */}
      <button type="button" className="ls-rhythm" id="live-rhythm" onClick={() => requestSettings('ritmo')}>
        {t.rhythmValue(pomo, shortBreak, longBreak)}
      </button>
    </div>
  );
}

/** O cartão aparece? Só em dia ao vivo de hoje, com nada rodando. */
export const showLiveStart = (mode: string, dateKey: string, timerBlock: StudyBlock | null, now: Date): boolean =>
  mode === 'live' && dateKey === dk(now) && !timerBlock;
