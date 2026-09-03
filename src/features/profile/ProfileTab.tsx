// Aba Perfil: cena com o personagem e o pet ativo, nível e XP, stats em 4 colunas,
// o card do pet ativo, e as portas pra "Meus pets" e pra loja.
// Ilha em #profile-root; mesmos ids/classes do markup antigo.

import { useEffect, useState } from 'react';
import { applyPendingPetXP, coinBalance } from '../../application/pets';
import { computeStatsNow } from '../../application/plan';
import { PET_LIST, formatStudyHours, petForm, petProgress } from '../../domain/pets';
import { getLevel, getLevelIdx, getLevelPct, LEVELS } from '../../domain/progression';
import type { PetInstance, PetSpecies } from '../../domain/types';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';
import { BuyConfirmModal, EvolvePetModal, MyPetsModal, PetShopModal, RenamePetModal } from '../pets/PetModals';
import { useSpriteFrame } from './useSpriteFrame';

const t = strings.profile;
const CHAR_FRAMES = 4;
type ProfileModal =
  | { kind: 'none' }
  | { kind: 'shop' }
  | { kind: 'mine' }
  | { kind: 'buy'; species: PetSpecies }
  | { kind: 'rename'; petId: string }
  | { kind: 'evolve'; petId: string };

function ActivePetCard({ pet }: { pet: PetInstance }) {
  const [spriteFailed, setSpriteFailed] = useState(false);
  const form = petForm(pet);
  const p = petProgress(pet);
  return (
    <div className="active-pet-card" id="active-pet-card">
      {!spriteFailed && <img className="ap-sprite" id="ap-sprite" src={form.sprite(0)} alt={form.name} onError={() => setSpriteFailed(true)} />}
      <div className="ap-info">
        <div className="ap-tag">{t.activeTag}</div>
        <div className="ap-name-row">
          <span className="ap-name" id="ap-name">{pet.name}</span>
          <span className="ap-lv" id="ap-lv">{strings.pets.lv(p.level)}</span>
        </div>
        <div className="ap-species" id="ap-species">{form.name}</div>
        <div className="ap-bar-track"><div className="ap-bar-fill" id="ap-bar-fill" style={{ width: `${p.pct}%` }} /></div>
        <div className="ap-xp" id="ap-xp">{t.apXp(p.xp, p.nextThreshold, p.remaining, p.level + 1)}</div>
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

  const activePet = pets.owned.find((p) => p.id === pets.active) ?? null;
  const activeForm = activePet ? petForm(activePet) : null;
  const charFrame = useSpriteFrame(CHAR_FRAMES, visible);
  const petFrame = useSpriteFrame(activeForm?.frames ?? 1, visible && !!activeForm);

  const stats = computeStatsNow();
  const balance = coinBalance();
  const totalXP = stats.totalXP;
  const next = LEVELS.find(([th]) => th > totalXP);
  const speciesCollected = new Set(pets.owned.map((p) => p.species)).size;
  const closeModal = () => setModal({ kind: 'none' });
  const backToMine = () => setModal({ kind: 'mine' });
  const petFor = (id: string | null) => (id ? pets.owned.find((p) => p.id === id) ?? null : null);

  return (
    <div className={'profile-page' + (visible ? ' visible' : '')} id="profile-page">
      <div className="profile-hero">
        <div className="profile-hero-stage">
          <img id="char-sprite" className="char-sprite" src={`idle/user/${charFrame}.png`} alt={strings.login.charAlt} />
          {activePet && activeForm && (
            <img id="pet-sprite" className="pet-sprite" src={activeForm.sprite(petFrame)} alt={activePet.name} />
          )}
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
        <span className="shop-open-count" id="my-pets-count">{t.count(speciesCollected, PET_LIST.length)}</span>
        <span className="shop-open-arrow">›</span>
      </button>
      <button type="button" className="shop-open-btn" onClick={() => setModal({ kind: 'shop' })}>
        <span className="shop-open-icon">🛒</span>
        <span className="shop-open-label">{t.shop}</span>
        <span className="shop-open-arrow">›</span>
      </button>

      <PetShopModal
        open={modal.kind === 'shop' || modal.kind === 'buy'}
        balance={balance}
        onClose={closeModal}
        onAdopt={(species) => setModal({ kind: 'buy', species })}
      />
      <MyPetsModal
        open={modal.kind === 'mine' || modal.kind === 'rename' || modal.kind === 'evolve'}
        onClose={closeModal}
        onRename={(pet) => setModal({ kind: 'rename', petId: pet.id })}
        onEvolve={(pet) => setModal({ kind: 'evolve', petId: pet.id })}
      />
      <BuyConfirmModal species={modal.kind === 'buy' ? modal.species : null} onClose={() => setModal({ kind: 'shop' })} />
      <RenamePetModal pet={modal.kind === 'rename' ? petFor(modal.petId) : null} onClose={backToMine} />
      <EvolvePetModal pet={modal.kind === 'evolve' ? petFor(modal.petId) : null} onClose={backToMine} />
    </div>
  );
}
