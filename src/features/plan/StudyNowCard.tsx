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
  /** O Plano abre a corrida — é ele o dono do consentimento do hardcore. */
  onStart: (at: Date) => void;
  onResumeRoutine: () => void;
}

export function StudyNowCard({ dateKey, stopped, canResume, onStart, onResumeRoutine }: Props) {
  const { pomo } = rhythmAtDay(dateKey);
  return (
    <div className="study-now" id="study-now">
      <div className="sn-note" id="study-now-note">{stopped ? t.stopped : t.over}</div>
      <button type="button" className="lv-btn" id="study-now-btn" onClick={() => onStart(new Date())}>
        <span className="lv-label">{t.start}</span>
        <span className="lv-chip">{strings.plan.liveStart.rhythmValue(pomo)}</span>
      </button>
      {canResume && (
        <button type="button" className="sn-routine" id="study-now-routine" onClick={onResumeRoutine}>
          {t.resumeRoutine}
        </button>
      )}
    </div>
  );
}
