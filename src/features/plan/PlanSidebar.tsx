// A coluna da esquerda do Plano no laptop (layout B7, 2026-09-07): o XP pendente de hoje, a meta diária,
// e o quarto ilustrado com o personagem e o pet equipado. A barra do timer (o cartão "Agora · Iniciar")
// vem logo abaixo, via CSS. Só existe em tela grande (o App só monta a partir de 1100px).

import { activePet } from '../../application/pets';
import { computeStatsNow, restKindOf } from '../../application/plan';
import { goalWeek } from '../../domain/analytics';
import { isDayClosed } from '../../domain/checks';
import { petForm, petLevel } from '../../domain/pets';
import { dk } from '../../domain/time';
import { strings } from '../../shared/strings';
import { setTab, useAppState } from '../../store/store';
import { useSpriteFrame } from '../profile/useSpriteFrame';
import { useColumnFit } from './useColumnFit';

const CHAR_FRAMES = 4;

/** O quarto do pacote "Café de casa", em CSS: janela, mesa, planta, caneca — e os sprites de verdade. */
function RoomCard() {
  const pet = useAppState(() => activePet());
  const form = pet ? petForm(pet) : null;
  const charFrame = useSpriteFrame(CHAR_FRAMES, true);
  const petFrame = useSpriteFrame(form?.frames ?? 1, !!form);
  const t = strings.plan.room;
  return (
    <div className="room-card" id="room-card">
      <div className="room" aria-hidden="true">
        <div className="room-floor" />
        {/* O palco é a composição de 300×190; em janela baixa o CSS encolhe ele inteiro (escala), não corta. */}
        <div className="room-stage">
          <div className="room-win"><i /></div>
          <div className="room-rug" />
          <div className="room-plant"><b /><b /><b /><span /></div>
          <div className="room-table"><div className="room-books" /><div className="room-mug" /></div>
          <img className="room-char" src={`idle/user/${charFrame}.png`} alt="" />
          {pet && form && <img className="room-pet" src={form.sprite(petFrame)} alt="" />}
        </div>
      </div>
      <div className="room-copy">
        <div className="room-head">
          <h4>{pet ? pet.name : t.noPet}</h4>
          {pet && <span className="room-lv">{t.level(petLevel(pet))}</span>}
        </div>
        <p>{pet ? t.tagline : t.noPetHint}</p>
        <button className="room-link" onClick={() => setTab('perfil')}>{pet ? t.seePets : t.adopt}</button>
      </div>
    </div>
  );
}

export function PlanSidebar() {
  useColumnFit(); // a coluna inteira cabe na altura da janela por escala (--col-k)
  const now = new Date();
  const todayKey = dk(now);
  const { min, closed } = useAppState((s) => ({
    min: s.config.dailyStudyMin || 60,
    closed: isDayClosed(s.closedDays, todayKey),
  }));
  const stats = computeStatsNow(now);
  const goal = goalWeek(stats, { now, restKind: restKindOf });
  const done = stats.dayStudyDoneMins[todayKey] || 0;
  const pending = stats.todayXP > 0 || stats.todayCoins > 0;
  const t = strings.plan.side;

  return (
    <aside className="plan-side" id="plan-side">
      <div className="side-item">
        <div className="side-k">{t.today}</div>
        {closed ? (
          <div className="side-v side-closed">{t.closed}</div>
        ) : pending ? (
          <div className="side-v side-pending">
            {strings.plan.xpGain(stats.todayXP)}
            <small>{t.pendingCoins(stats.todayCoins)}</small>
          </div>
        ) : (
          <div className="side-v side-none">{t.none}</div>
        )}
      </div>
      <div className="side-item">
        <div className="side-k">{t.goal(min)}</div>
        <div className="side-v">
          {done}
          <small>{t.goalMin}</small>
        </div>
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${Math.min(100, Math.round((done / min) * 100))}%` }} />
        </div>
        <div className="side-sub">{t.goalDaysShort(goal.metCount, goal.totalDays)}</div>
      </div>
      <RoomCard />
    </aside>
  );
}
