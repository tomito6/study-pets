// A SEMANA NO CELULAR: um cartão por dia, numa faixa que desliza.
//
// É a direção C dos cinco esboços de `prototypes/semana-no-celular.html`, escolhida
// pelo Tomi. A Semana do laptop (`WeekView`) desenha o dia em GEOMETRIA — cada bloco
// na altura da duração —, e isso não cabe em 390px sem virar sete colunas espremidas,
// que já tinham sido descartadas. Aqui o dia vira TEXTO condensado: uma linha por
// ciclo, uma linha por compromisso, e o dia inteiro cabe sem rolar por dentro.
//
// **O que cada cartão diz, e o que ele não diz.** Ele responde "onde tem compromisso
// e quanto sobra em volta" — a pergunta que se faz na rua. Não responde "que forma
// tem o dia": um pomodoro de 25 min e uma aula de 2h ocupam a mesma linha, e a
// duração está escrita, não desenhada. Quem quer a forma abre o dia.
//
// **A pausa longa não ganha linha** (a crítica do esboço tinha razão): ela é o que
// separa um ciclo do outro, então já está dita pelo próprio corte entre as linhas —
// e com ela um dia padrão passava de 5 linhas pra 9, empurrando a tarde pra fora.
//
// **Nada é gerado aqui**: `blocksForDay` já dá o dia pronto, memoizado. Sem campo
// novo, sem `schemaVersion`, sem tocar o domínio.

import { useCallback, useEffect, useRef } from 'react';
import { blocksForDay, dateForWeekDay, restKindOf } from '../../application/plan';

import { formatCompact } from '../../domain/settings';
import { blockMins, dk } from '../../domain/time';
import { cleanBlockName } from '../../domain/timer';
import type { CheckRecord, StudyBlock, TimeString } from '../../domain/types';
import { strings } from '../../shared/strings';
import { setDay, useAppState } from '../../store/store';

const t = strings.plan;
const tc = strings.plan.cards;

/** Uma linha do cartão: uma corrida de pomodoros, ou um compromisso. */
type Ciclo = { kind: 'ciclo'; key: string; time: string; cycle: number; done: number; total: number; mins: number };

type Linha =
  | Ciclo
  | { kind: 'evento'; key: string; time: string; name: string; mins: number; done: boolean };

/**
 * O dia condensado. Estudo e pausa consecutivos do mesmo ciclo viram UMA linha;
 * evento e intervalo viram linha própria, porque é neles que a semana difere.
 * A conta de minutos é sempre a PLANEJADA (`blockMins` dos estudos), nunca a feita —
 * misturar as duas na mesma coluna era o que tornava "3/4 · 1h45" ilegível.
 */
export function condensar(blocks: StudyBlock[], dayChecks: Record<TimeString, CheckRecord> | undefined): Linha[] {
  const marcado = (time: TimeString): boolean => !!dayChecks?.[time];
  const linhas: Linha[] = [];
  let atual: Ciclo | null = null;
  for (const b of blocks) {
    if (b.type === 'event' || b.type === 'intervalo') {
      atual = null;
      linhas.push({
        kind: 'evento',
        key: `e${b.time}`,
        time: b.time,
        name: cleanBlockName(b.name),
        mins: blockMins(b),
        done: marcado(b.time),
      });
      continue;
    }
    const cycle = b.cycle ?? 0; // pausa/estudo sempre têm ciclo; o tipo é que o deixa opcional
    const mesmo = atual && atual.cycle === cycle ? atual : null;
    const ciclo: Ciclo = mesmo ?? { kind: 'ciclo', key: `c${b.time}`, time: b.time, cycle, done: 0, total: 0, mins: 0 };
    if (!mesmo) linhas.push(ciclo);
    atual = ciclo;
    if (b.type !== 'estudo') continue; // a pausa entra no ciclo, mas não conta nem soma
    ciclo.total++;
    ciclo.mins += blockMins(b);
    if (marcado(b.time)) ciclo.done++;
  }
  return linhas;
}

interface Props {
  week: number;
  now: Date;
  /** "Abrir o dia": leva pro Dia daquele cartão. */
  onOpenDay: (dayIdx: number) => void;
}

export function WeekCards({ week, now, onOpenDay }: Props) {
  const checks = useAppState((s) => s.checks);
  const day = useAppState((s) => s.uiDay);
  const strip = useRef<HTMLDivElement>(null);
  const todayKey = dk(now);

  const dias = t.days.map((label, i) => {
    const date = dateForWeekDay(week, i);
    const key = dk(date);
    const rest = restKindOf(key);
    const blocks = rest ? [] : blocksForDay(key);
    return { i, label, key, date, rest, blocks, isToday: key === todayKey };
  });

  // A aba mandou: centra o cartão. `scrollIntoView({inline:'center'})` e não uma conta
  // de `offsetLeft` — o `scroll-snap-align:center` recentra tudo depois, e uma conta
  // própria discordaria dele pelo padding da faixa. `behavior:'auto'` de propósito:
  // com animação a aba e o cartão discordariam no meio do caminho.
  //
  // Não há trava contra o handler de scroll abaixo, e não precisa: este scroll pousa
  // no cartão do dia que JÁ está ativo, então o handler calcula o mesmo índice e não
  // faz nada. A trava que eu tinha posto (um timeout de 60 ms) só criava uma corrida —
  // um deslize dentro da janela dela era engolido.
  useEffect(() => {
    const card = strip.current?.children[day] as HTMLElement | undefined;
    card?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
  }, [day, week]);

  // O dedo mandou: a aba acompanha.
  const onScroll = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    // Qual cartão está mais perto do meio da faixa — a mesma régua do `scroll-snap-align:
    // center`. Medido por `getBoundingClientRect`, que é da janela nos dois lados: dividir
    // o `scrollLeft` pela largura do cartão erra o padding da faixa e o último dia.
    const faixa = el.getBoundingClientRect();
    const meio = faixa.left + faixa.width / 2;
    let idx = 0;
    let melhor = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const c = (el.children[i] as HTMLElement).getBoundingClientRect();
      const dist = Math.abs(c.left + c.width / 2 - meio);
      if (dist < melhor) {
        melhor = dist;
        idx = i;
      }
    }
    if (idx !== day) setDay(idx);
  }, [day]);

  return (
    <div className="wk-strip" id="week-cards" ref={strip} onScroll={onScroll}>
      {dias.map((d) => {
        const linhas = condensar(d.blocks, checks[d.key]);
        const plano = d.blocks.filter((b) => b.type === 'estudo').reduce((n, b) => n + blockMins(b), 0);
        const feito = linhas.reduce((n, l) => n + (l.kind === 'ciclo' && l.done > 0 ? Math.round((l.mins * l.done) / Math.max(1, l.total)) : 0), 0);
        return (
          <section className={'wk-card' + (d.isToday ? ' today' : '')} key={d.key} data-day-key={d.key}>
            <header className="wk-head">
              <h4>{d.label} · {d.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</h4>
              {d.isToday && <span className="wk-today">{tc.today}</span>}
            </header>
            <p className="wk-sub">
              {d.rest ? tc.rest[d.rest]
                : plano === 0 ? tc.empty
                : feito > 0 ? tc.progress(formatCompact(feito), formatCompact(plano))
                : tc.planned(formatCompact(plano))}
            </p>
            {linhas.length > 0 && (
              <ul className="wk-lines">
                {linhas.map((l) => (
                  <li className={'wk-line ' + l.kind} key={l.key} data-cycle={l.kind === 'ciclo' ? l.cycle % 6 : undefined}>
                    <span className="wk-time">{l.time}</span>
                    <span className="wk-name">{l.kind === 'ciclo' ? tc.cycle(l.cycle + 1) : l.name}</span>
                    <span className="wk-meta">
                      {l.kind === 'ciclo' && <span className={'wk-count' + (l.done === l.total && l.total > 0 ? ' full' : '')}>{tc.count(l.done, l.total)}</span>}
                      {l.kind === 'evento' && l.done && <span className="wk-count full">✓</span>}
                      <span className="wk-dur">{formatCompact(l.mins)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="wk-open" onClick={() => onOpenDay(d.i)}>{tc.open} ›</button>
          </section>
        );
      })}
    </div>
  );
}
