// "▶ Estudar agora": a porta de hoje quando o plano da rotina não tem mais nada que dê
// pra iniciar (2026-11-26). Dois caminhos levavam a esse beco, e os dois eram comuns:
//
//  - o plano inteiro já passou — quem cria a conta às 21h nasce com 09:00–18:00 no
//    passado, e tocar em qualquer bloco só dizia "Este bloco já terminou";
//  - "■ Parar por aqui" num dia de rotina — o resto do dia sai do plano, a folha diz
//    "Dá pra voltar mais tarde", e a única volta era 🕘 Estrutura · editado → ↺ Restaurar rotina.
//
// A saída existia (o modo ao vivo), mas atrás de três toques que ninguém adivinha. Aqui
// ela é um botão: abre uma corrida agora, e o dia segue ao vivo dali em diante (ver
// `canStudyNow` em application/live.ts). Quando o dia foi cortado e a rotina ainda tem
// tarde pela frente, a outra volta aparece junto: remontar o resto do dia pela rotina.
//
// Fica ACIMA da lista, e não embaixo como o cartão do ao vivo: às 21h a lista tem 32
// linhas apagadas, e uma porta depois delas estaria a duas telas de distância.

import { rhythmAtDay } from '../../application/plan';
import { strings } from '../../shared/strings';

const t = strings.plan.studyNow;

interface Props {
  dateKey: string;
  /** O dia foi cortado por uma parada (tem corrida)? Muda só a frase. */
  stopped: boolean;
  /** A rotina ainda tem blocos pra devolver de agora em diante? */
  canResume: boolean;
  /**
   * No laptop o cartão mora na agenda, no lugar do cartão "Agora" (que neste estado não tem
   * bloco pra oferecer), com a mesma cara dele e do "▶ Começar" do ao vivo: `.plan-live`.
   */
  agenda?: boolean;
  /** O Plano abre a corrida — é ele o dono do consentimento do hardcore. */
  onStart: (at: Date) => void;
  onResumeRoutine: () => void;
}

export function StudyNowCard({ dateKey, stopped, canResume, agenda = false, onStart, onResumeRoutine }: Props) {
  const { pomo } = rhythmAtDay(dateKey);
  const ritmo = strings.plan.liveStart.rhythmValue(pomo);
  return (
    <div className={'study-now' + (agenda ? ' plan-live' : '')} id="study-now">
      {agenda ? (
        <div className="timer-summary">
          <div className="agora-k">{strings.timer.now.current}</div>
          <h2 className="timer-block-name" id="study-now-note">{stopped ? t.stoppedTitle : t.overTitle}</h2>
          <div className="agora-dur">{(stopped ? t.stoppedSub : t.overSub) + ' · ' + ritmo}</div>
        </div>
      ) : (
        <div className="sn-note" id="study-now-note">{stopped ? t.stopped : t.over}</div>
      )}
      {agenda && canResume && (
        <button type="button" className="sn-routine" id="study-now-routine" onClick={onResumeRoutine}>
          {t.resumeRoutine}
        </button>
      )}
      <button type="button" className="lv-btn" id="study-now-btn" onClick={() => onStart(new Date())}>
        <span className="lv-label">{t.start}</span>
        {!agenda && <span className="lv-chip">{ritmo}</span>}
      </button>
      {!agenda && canResume && (
        <button type="button" className="sn-routine" id="study-now-routine" onClick={onResumeRoutine}>
          {t.resumeRoutine}
        </button>
      )}
    </div>
  );
}
