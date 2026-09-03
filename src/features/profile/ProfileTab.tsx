// Aba Perfil: cena com o personagem e o pet ativo, nível e XP, stats em 4 colunas,
// o card do pet ativo, e as portas pra "Meus pets" e pra loja.
// Ilha em #profile-root; mesmos ids/classes do markup antigo.

import { useEffect, useState } from 'react';
import { applyPendingPetXP, coinBalance } from '../../application/pets';
import { computeStatsNow } from '../../application/plan';
import { PET_LIST, PETS, formatStudyHours, petProgress } from '../../domain/pets';
import { getLevel, getLevelIdx, getLevelPct, LEVELS } from '../../domain/progression';
import type { PetDefinition } from '../../domain/types';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';
import { BuyConfirmModal, MyPetsModal, PetShopModal } from '../pets/PetModals';
import { useSpriteFrame } from './useSpriteFrame';

const t = strings.profile;
const CHAR_FRAMES = 4;
type ProfileModal = { kind: 'none' } | { kind: 'shop' } | { kind: 'mine' } | { kind: 'buy'; pet: PetDefinition; from: 'shop' | 'mine' };

function ActivePetCard({ pet }: { pet: PetDefinition }) {
  const pets = useAppState((s) => s.pets);
  const [spriteFailed, setSpriteFailed] = useState(false);
  const p = petProgress(pets, pet.id);
  return (
    <div className="active-pet-card" id="active-pet-card">
      {!spriteFailed && <img className="ap-sprite" id="ap-sprite" src={pet.sprite(0)} alt={pet.name} onError={() => setSpriteFailed(true)} />}
      <div className="ap-info">
        <div className="ap-tag">{t.activeTag}</div>
        <div className="ap-name-row">
          <span className="ap-name" id="ap-name">{pet.name}</span>
          <span className="ap-lv" id="ap-lv">{strings.pets.lv(p.level)}</span>
        </div>
        <div className="ap-bar-track"><div className="ap-bar-fill" id="ap-bar-fill" style={{ width: `${p.pct}%` }} /></div>
        <div className="ap-xp" id="ap-xp">
          {p.nextThreshold === null ? t.apXpMax(p.xp) : t.apXp(p.xp, p.nextThreshold, p.remaining, p.level + 1)}
        </div>
      </div>
    </div>
  );
}

export function ProfileTab() {
  const { tab, pets } = useAppState((s) => ({ tab: s.uiTab, pets: s.pets }));
  const visible = tab === 'perfil';
  const [modal, setModal] = useState<ProfileModal>({ kind: 'none' });

  // Se o app atravessou a meia-noite aberto, o XP do dia fechado entra nos pets aqui.
  useEffect(() => {
    if (visible) applyPendingPetXP();
  }, [visible]);

  const activePet = pets.active ? PETS[pets.active] ?? null : null;
  const charFrame = useSpriteFrame(CHAR_FRAMES, visible);
  const petFrame = useSpriteFrame(activePet?.frames ?? 1, visible && !!activePet);

  const stats = computeStatsNow();
  const balance = coinBalance();
  const totalXP = stats.totalXP;
  const next = LEVELS.find(([th]) => th > totalXP);
  const closeModal = () => setModal({ kind: 'none' });
  const openBuy = (pet: PetDefinition) => setModal((m) => ({ kind: 'buy', pet, from: m.kind === 'mine' ? 'mine' : 'shop' }));
  const closeBuy = () => setModal((m) => (m.kind === 'buy' ? { kind: m.from } : m));

  return (
    <div className={'profile-page' + (visible ? ' visible' : '')} id="profile-page">
      <div className="profile-hero">
        <div className="profile-hero-stage">
          <img id="char-sprite" className="char-sprite" src={`idle/user/${charFrame}.png`} alt={strings.login.charAlt} />
          {activePet && <img id="pet-sprite" className="pet-sprite" src={activePet.sprite(petFrame)} alt={activePet.name} />}
        </div>
        <div className="profile-hero-divider" />
        <div className="profile-hero-row">
          <div className="profile-hero-left">
            <div className="profile-hero-name">
              <span id="char-name">{t.name}</span>
              <span className="hero-lv-badge" id="char-level-badge">{strings.pets.lv(getLevelIdx(totalXP) + 1)}</span>
            </div>
            <div className="profile-hero-sub" id="char-title-sub">{getLevel(totalXP)}</div>
          </div>
          <div className="profile-hero-right">
            <div className="phr-label">{t.nextLevel}</div>
            <div className="phr-val" id="char-xp-next-val">{next ? strings.header.xp(next[0] - totalXP) : t.max}</div>
          </div>
        </div>
        <div className="profile-hero-bar">
          <div className="bar-fill" id="char-xp-bar" style={{ width: `${getLevelPct(totalXP)}%` }} />
        </div>
      </div>

      <div className="profile-stats-4">
        <div className="profile-stat-mini"><div className="psm-val" id="ps-xp">{totalXP}</div><div className="psm-label">{t.xpTotal}</div></div>
        <div className="profile-stat-mini"><div className="psm-val" id="ps-blocks">{stats.totalChecks}</div><div className="psm-label">{t.blocks}</div></div>
        <div className="profile-stat-mini"><div className="psm-val" id="ps-hours">{formatStudyHours(stats.studyMins)}</div><div className="psm-label">{t.study}</div></div>
        <div className="profile-stat-mini coins-stat"><div className="psm-val" id="char-coins">{balance}</div><div className="psm-label">{t.coins}</div></div>
      </div>

      {activePet ? (
        <ActivePetCard pet={activePet} />
      ) : (
        <div className="no-active-pet" id="no-active-pet">{t.noActivePet}</div>
      )}

      <button type="button" className="shop-open-btn" onClick={() => setModal({ kind: 'mine' })}>
        <span className="shop-open-icon">🐾</span>
        <span className="shop-open-label">{t.myPets}</span>
        <span className="shop-open-count" id="my-pets-count">{t.count(pets.owned.length, PET_LIST.length)}</span>
        <span className="shop-open-arrow">›</span>
      </button>
      <button type="button" className="shop-open-btn" onClick={() => setModal({ kind: 'shop' })}>
        <span className="shop-open-icon">🛒</span>
        <span className="shop-open-label">{t.shop}</span>
        <span className="shop-open-arrow">›</span>
      </button>

      <PetShopModal open={modal.kind === 'shop' || (modal.kind === 'buy' && modal.from === 'shop')} balance={balance} onClose={closeModal} onAdopt={openBuy} />
      <MyPetsModal open={modal.kind === 'mine' || (modal.kind === 'buy' && modal.from === 'mine')} balance={balance} onClose={closeModal} onAdopt={openBuy} />
      <BuyConfirmModal pet={modal.kind === 'buy' ? modal.pet : null} onClose={closeBuy} />
    </div>
  );
}
