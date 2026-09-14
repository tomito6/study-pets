// A FAIXA do dia ao vivo: o "um botão só" do modo. Texto à esquerda ("Pronto quando você
// estiver." / "Você parou às 10:12."), o ritmo ou o placar como subtítulo, o botão à direita.
//
// É a opção B de `prototypes/live-start-menor.html`, a recomendada e a escolhida: a versão
// anterior era um cartaz centralizado (269px, depois 150px) que ocupava o lugar da lista
// pra dizer "aperte aqui" — e prometia que algo importante acontecia ali, quando o que
// acontece é o botão abrir o modo foco. A faixa é a forma que a barra do timer já usa,
// mede 66–82px, e devolve a tela pro que interessa: os pomodoros que vão aparecendo.
// Ela não é a tela do modo (num dia ao vivo quem está na frente é o foco): é o primeiro
// toque do dia, e a porta de volta depois de uma parada.

import { blocksForDay } from '../../application/plan';
import { isChecked } from '../../domain/checks';
import { blockMins, dk } from '../../domain/time';
import type { StudyBlock } from '../../domain/types';
import { formatCompact } from '../../domain/settings';
import { strings } from '../../shared/strings';
import { requestSettings } from '../../application/settings';
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
  const { pomo, shortBreak, longBreak, checks, override } = useAppState((s) => ({ ...s.config, checks: s.checks, override: s.windowOverrides[dateKey] }));
  const blocos = blocksForDay(dateKey);
  const estudos = blocos.filter((b) => b.type === 'estudo');
  // O que já rolou conta por CHECK, não por bloco: um bloco aparado sem check (o ✕ da
  // barra, um reload) ou um fantasma não é pomodoro feito. Sem check nenhum, o kicker é
  // o de um dia que não começou — "0 pomodoros" leria como cobrança.
  const feitos = estudos.filter((b) => isChecked(checks, dateKey, b.time));
  // O dia já teve corrida? A régua é ESTUDO, não "tem bloco": desde que o dia ao vivo
  // mostra os compromissos antes de começar (a refeição das 13h, que toda conta tem),
  // `blocos.length > 0` é verdade num dia que nunca começou — e o cartão dizia
  // "▶ Voltar" e "0 pomodoros" pra quem ainda não tinha apertado nada.
  // A hora em que parou não é dita aqui: ela é o fim do último bloco da lista, logo
  // acima do cartão, e repetir seria contar duas vezes.
  const jaRodou = estudos.length > 0;
  const minutos = feitos.reduce((soma, b) => soma + blockMins(b), 0);
  // Quando parou: o fim da última corrida do dia (a janela `live` que termina mais tarde).
  const parouAs = (override?.studyWindows ?? []).filter((w) => w.live).reduce<string | null>((m, w) => (m === null || w.end > m ? w.end : m), null);

  return (
    <div className="live-start" id="live-start">
      <div className="lv-l">
        <div className="lv-title" id="live-start-title">{jaRodou && parouAs ? t.stoppedAt(parouAs) : t.title}</div>
        {feitos.length > 0 ? (
          <div className="lv-sub" id="live-tally">{t.tally(feitos.length, formatCompact(minutos))}</div>
        ) : (
          /* O único lugar do app, fora das Configurações, que NOMEIA o ritmo — e a faixa
             acabou de pedir pra pessoa escolher um. Então ele também é porta: a mesma da
             "🕘 Janelas do dia" (ver CLAUDE.md, "O ritmo tem porta"). */
          <button type="button" className="lv-sub lv-rhythm" id="live-rhythm" onClick={() => requestSettings('rhythm')}>
            {t.rhythmValue(pomo, shortBreak, longBreak)}
          </button>
        )}
      </div>
      <button type="button" className="lv-btn" id="live-start-btn" onClick={() => onStart(new Date())}>
        {jaRodou ? t.back : t.start}
      </button>
    </div>
  );
}

/** O cartão aparece? Só em dia ao vivo de hoje, com nada rodando. */
export const showLiveStart = (mode: string, dateKey: string, timerBlock: StudyBlock | null, now: Date): boolean =>
  mode === 'live' && dateKey === dk(now) && !timerBlock;
