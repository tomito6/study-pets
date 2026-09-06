// Experimento temporário: o botão flutuante (canto inferior esquerdo) que alterna o estilo das abas
// do cabeçalho. Sai junto com `navStyle.ts` quando um dos dois estilos for escolhido.

import { strings } from '../shared/strings';
import { setNavStyle, useNavStyle } from './navStyle';

export function NavStyleSwitch() {
  const style = useNavStyle();
  const other = style === 'icons' ? 'underline' : 'icons';
  return (
    <button
      id="nav-style-switch"
      className="nav-style-switch"
      title={strings.navExperiment.hint}
      onClick={() => setNavStyle(other)}
    >
      {strings.navExperiment.label(strings.navExperiment.names[style])}
    </button>
  );
}
