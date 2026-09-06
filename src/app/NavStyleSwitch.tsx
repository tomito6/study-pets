// Experimento temporário: o botão flutuante (canto inferior esquerdo) que alterna o estilo das abas
// do cabeçalho (ícones → sublinhado → original). Sai junto com `navStyle.ts` quando um for escolhido.

import { strings } from '../shared/strings';
import { NEXT_STYLE, setNavStyle, useNavStyle } from './navStyle';

export function NavStyleSwitch() {
  const style = useNavStyle();
  return (
    <button
      id="nav-style-switch"
      className="nav-style-switch"
      title={strings.navExperiment.hint}
      onClick={() => setNavStyle(NEXT_STYLE[style])}
    >
      {strings.navExperiment.label(strings.navExperiment.names[style])}
    </button>
  );
}
