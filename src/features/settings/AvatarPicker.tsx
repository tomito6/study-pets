// O seletor de aparência do personagem, na aba Geral das Configurações.
//
// Diferente do tema, isto VAI pro Firestore (é identidade, não preferência do
// aparelho) — mas também aplica na hora, sem rascunho nem "Salvar": trocar de tom
// de pele sem ver o resultado no mesmo segundo não faz sentido. `setAvatar` já
// agenda o save.
//
// Os controles em si moram em `features/avatar/AvatarControls` — o onboarding
// usa os mesmos, com a escolha guardada em outro lugar.

import { setAvatar } from '../../application/avatar';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';
import { AvatarControls } from '../avatar/AvatarControls';

const t = strings.settings.avatar;

export function AvatarPicker({ active }: { active: boolean }) {
  const avatar = useAppState((s) => s.avatar);

  return (
    <div className="st-section">
      <div className="st-section-head"><div className="st-section-title">{t.title}</div></div>
      <div className="st-section-desc">{t.desc}</div>
      <div className="st-card av-card" id="avatar-picker">
        <AvatarControls value={avatar} onChange={setAvatar} active={active} />
        <div className="st-hint">{t.hint}</div>
      </div>
    </div>
  );
}
