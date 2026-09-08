// A linha discreta "🛡️ 3 sites bloqueados", na barra do timer e dentro do foco.
//
// Só aparece quando a **extensão confirmou** ter aplicado as regras (o ack) —
// nunca só porque a config está ligada. Sem extensão, nada aparece aqui: o lugar
// de dizer "não encontrada" é Configurações, não o meio do estudo.

import { blockingNow } from '../../application/siteBlock';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';

export function SiteBlockBadge({ className = 'site-block-badge' }: { className?: string }) {
  const mode = useAppState((_s, d) => d.siteBlock.ack?.mode ?? null);
  const live = blockingNow();
  if (!live) return null;
  const text = mode === 'whitelist' ? strings.siteBlock.liveWhitelist(live.sites) : strings.siteBlock.live(live.sites);
  return <div className={className} id="site-block-badge">{text}</div>;
}
