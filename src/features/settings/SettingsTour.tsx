// O tour da página de Configurações: um cartão no rodapé, e a própria página acende
// a seção de que ele fala.
//
// Por que cartão e não balão ancorado: `.tour-balloon` é `z-index:80` e a
// `.settings-page` é `z-index:200` — nenhum balão do `TourBalloon` renderiza aqui
// dentro. E a página rola num container próprio (`.st-scroll`), então a medição em
// coordenadas do documento, que o balão faz, também não valeria. O cartão no rodapé
// é a forma que o próprio `TourBalloon` já usa quando a âncora não existe.
//
// Ele é FILHO da `.settings-page`, não um `position:fixed` solto: acima de 1100px o
// `#app` é escalado (`zoom`/`--col-k`), e `fixed` lá dentro não é a janela.

import { SETTINGS_TOUR } from '../../domain/tutorial';
import { strings } from '../../shared/strings';

const t = strings.tutorial;

interface Props {
  /** Índice do passo atual em `SETTINGS_TOUR`. */
  passo: number;
  onNext: () => void;
  onSkip: () => void;
}

export function SettingsTour({ passo, onNext, onSkip }: Props) {
  const step = SETTINGS_TOUR[passo];
  if (!step) return null;
  const texto = t.settings.steps[step.id];
  if (!texto) return null;
  const ultimo = passo === SETTINGS_TOUR.length - 1;

  return (
    <div className="st-tour" id="settings-tour" role="dialog" aria-label={t.settings.intro}>
      <div className="st-tour-head">
        <span className="st-tour-kicker">{t.settings.intro}</span>
        <span className="st-tour-count" id="settings-tour-count">{t.counter(passo + 1, SETTINGS_TOUR.length)}</span>
      </div>
      <div className="st-tour-title" id="settings-tour-title">{texto.title}</div>
      <p className="st-tour-body">{texto.body}</p>
      <div className="st-tour-actions">
        {/* "Pular" continua existindo, e existe de propósito: sem ele este cartão é a
            única coisa na tela sem saída por teclado, e o CLAUDE.md proíbe o padrão de
            prender quem só queria abrir as Configurações. Ver a pendência do tour
            obrigatório pra como armá-lo com segurança. */}
        <button type="button" className="st-tour-skip" id="settings-tour-skip" onClick={onSkip}>{t.skip}</button>
        <button type="button" className="st-tour-next" id="settings-tour-next" onClick={onNext}>
          {ultimo ? t.done : t.next}
        </button>
      </div>
    </div>
  );
}
