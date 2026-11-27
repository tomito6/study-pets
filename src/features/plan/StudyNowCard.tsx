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
//
// SEM FRASE (2026-11-27, pedido do Tomi: "ODEIO que você bota um trilhão de frases ao longo
// da página"). A primeira versão explicava o estado ("O plano de hoje já passou. Dá pra
// estudar agora mesmo assim:") e no laptop virava um cartão com título e subtítulo próprios.
// No laptop ele é o cartão Agora, igual: "Agora · Estudo 17 · 21:10–21:35 · 25 min · Iniciar"
// — o bloco que nasceria neste minuto. No celular é só o botão. O lugar e o botão já dizem
// o que é; a lista logo abaixo já mostra que o plano passou.

import { rhythmAtDay } from '../../application/plan';
import { blockDurationMin, cleanBlockName } from '../../domain/timer';
import type { StudyBlock } from '../../domain/types';
import { strings } from '../../shared/strings';

const t = strings.plan.studyNow;
const tn = strings.timer.now;

interface Props {
  dateKey: string;
  /** A rotina ainda tem blocos pra devolver de agora em diante? */
  canResume: boolean;
  /**
   * No laptop o cartão mora na agenda, no lugar do cartão "Agora" (que neste estado não tem
   * bloco pra oferecer) e com o MESMO desenho dele: `.plan-live`.
   */
  agenda?: boolean;
  /** O bloco que nasceria agora (a prévia, sem gravar) — é ele que o cartão da agenda anuncia. */
  block?: StudyBlock | null;
  /** O Plano abre a corrida — é ele o dono do consentimento do hardcore. */
  onStart: (at: Date) => void;
  onResumeRoutine: () => void;
}

export function StudyNowCard({ dateKey, canResume, agenda = false, block = null, onStart, onResumeRoutine }: Props) {
  const { pomo } = rhythmAtDay(dateKey);
  const ritmo = strings.plan.liveStart.rhythmValue(pomo);
  const voltar = canResume && (
    <button type="button" className="sn-routine" id="study-now-routine" onClick={onResumeRoutine}>
      {t.resumeRoutine}
    </button>
  );
  if (agenda) {
    return (
      <section className="study-now plan-live" id="study-now" aria-label={tn.current}>
        <div className="timer-summary">
          <div className="agora-k">{tn.current}</div>
          <h2 className="timer-block-name" id="study-now-name">{block ? cleanBlockName(block.name) : t.fallbackName}</h2>
          <div className="agora-dur">{block ? tn.window(block.time, block.endTime, blockDurationMin(block)) : ritmo}</div>
        </div>
        {voltar}
        <button type="button" className="lv-btn" id="study-now-btn" onClick={() => onStart(new Date())}>
          <span className="lv-label">{tn.start}</span>
        </button>
      </section>
    );
  }
  return (
    <div className="study-now" id="study-now">
      <button type="button" className="lv-btn" id="study-now-btn" onClick={() => onStart(new Date())}>
        <span className="lv-label">{t.start}</span>
        <span className="lv-chip">{ritmo}</span>
      </button>
      {voltar}
    </div>
  );
}
