// Aba Perfil: cena com o personagem e o pet ativo, nível e XP, stats em 4 colunas,
// o card do pet ativo (que abre o modal do pet), e as portas pra "Meus pets" e pra loja.
// Ilha em #profile-root; mesmos ids/classes do markup antigo.

import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { currentAvatarSprites } from '../../application/avatar';
import { applyPendingPetXP, coinBalance } from '../../application/pets';
import { computeStatsNow } from '../../application/plan';
import { AVATAR_FRAMES } from '../../domain/avatar';
import { PET_LIST, canEvolveNow, formatStudyHours, petForm, petProgress, petsReadyToEvolve } from '../../domain/pets';
import { getLevel, getLevelIdx, getLevelPct, LEVELS } from '../../domain/progression';
import type { PetInstance, PetSpecies } from '../../domain/types';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';
import { BuyConfirmModal, EvolvePetModal, MyPetsModal, PetDetailModal, PetShopModal, RenamePetModal } from '../pets/PetModals';
import { useSpriteFrame } from './useSpriteFrame';

const t = strings.profile;

/** De onde renomear/evoluir foi aberto — é pra lá que volta ao fechar. */
type ModalBack = 'mine' | 'detail';
type ProfileModal =
  | { kind: 'none' }
  | { kind: 'shop' }
  | { kind: 'mine' }
  | { kind: 'detail'; petId: string }
  | { kind: 'buy'; species: PetSpecies }
  | { kind: 'rename'; petId: string; back: ModalBack }
  | { kind: 'evolve'; petId: string; back: ModalBack };

/**
 * O card do pet equipado. É um botão (role=button, Enter/Espaço): tocar abre o
 * modal do pet. O selo "✨ Pode evoluir" é derivado de `evolutionOf` na render —
 * fica enquanto a evolução estiver disponível e some sozinho ao evoluir.
 */
function ActivePetCard({ pet, onOpen }: { pet: PetInstance; onOpen: () => void }) {
  const [spriteFailed, setSpriteFailed] = useState(false);
  const form = petForm(pet);
  const p = petProgress(pet);
  const ready = canEvolveNow(pet);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <div className="active-pet-card" id="active-pet-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={onKey}>
      {/* A casa do pet: uma cena de campo (data-habitat — no futuro, outros habitats por aqui). */}
      <div className="habitat" data-habitat="campo" aria-hidden="true">
        <i className="hb-sun" /><i className="hb-hill hb-hill-b" /><i className="hb-hill hb-hill-a" /><i className="hb-tree" /><i className="hb-ground" />
        {!spriteFailed && <img className="ap-sprite" id="ap-sprite" src={form.sprite(0)} alt={form.name} onError={() => setSpriteFailed(true)} />}
      </div>
      <div className="ap-body">
      <div className="ap-info">
        <div className="ap-tag">{t.activeTag}</div>
        <div className="ap-name-row">
          <span className="ap-name" id="ap-name">{pet.name}</span>
          <span className="ap-lv" id="ap-lv">{strings.pets.lv(p.level)}</span>
          {ready && <span className="ap-evo-badge" id="ap-evo-badge">{t.canEvolve}</span>}
        </div>
        <div className="ap-species" id="ap-species">{form.name}</div>
        <div className="ap-bar-track"><div className="ap-bar-fill" id="ap-bar-fill" style={{ width: `${p.pct}%` }} /></div>
        <div className="ap-xp" id="ap-xp">{t.apXp(p.xp, p.nextThreshold, p.remaining, p.level + 1)}</div>
      </div>
      <span className="ap-chevron" aria-hidden="true">›</span>
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
  const charSprites = useAppState(() => currentAvatarSprites());
  const charFrame = useSpriteFrame(AVATAR_FRAMES, visible);
  const petFrame = useSpriteFrame(activeForm?.frames ?? 1, visible && !!activeForm);

  const stats = computeStatsNow();
  const balance = coinBalance();
  const totalXP = stats.totalXP;
  const next = LEVELS.find(([th]) => th > totalXP);
  const speciesCollected = new Set(pets.owned.map((p) => p.species)).size;
  const readyCount = petsReadyToEvolve(pets.owned).length;
  const closeModal = () => setModal({ kind: 'none' });
  const petFor = (id: string | null) => (id ? pets.owned.find((p) => p.id === id) ?? null : null);

  // Renomear/evoluir voltam pra onde foram abertos: "Meus pets" ou o modal do pet.
  const stacked = modal.kind === 'rename' || modal.kind === 'evolve';
  const mineOpen = modal.kind === 'mine' || (stacked && modal.back === 'mine');
  const detailPetId = modal.kind === 'detail' ? modal.petId : stacked && modal.back === 'detail' ? modal.petId : null;
  const backFrom = () => {
    if (modal.kind === 'rename' || modal.kind === 'evolve') setModal(modal.back === 'detail' ? { kind: 'detail', petId: modal.petId } : { kind: 'mine' });
    else closeModal();
  };

  return (
    <div className={'profile-page' + (visible ? ' visible' : '')} id="profile-page">
      <div className="profile-hero">
        <div className="profile-hero-stage">
          <img id="char-sprite" className="char-sprite" src={charSprites[charFrame]} alt={strings.login.charAlt} />
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
        <ActivePetCard pet={activePet} onOpen={() => setModal({ kind: 'detail', petId: activePet.id })} />
      ) : (
        <div className="no-active-pet" id="no-active-pet">{t.noActivePet}</div>
      )}

      <button type="button" className="shop-open-btn" onClick={() => setModal({ kind: 'mine' })}>
        <span className="shop-open-icon">🐾</span>
        <span className="shop-open-label">{t.myPets}</span>
        {readyCount > 0 && <span className="shop-open-evo" id="my-pets-evo">{t.canEvolveCount(readyCount)}</span>}
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
        open={mineOpen}
        onClose={closeModal}
        onRename={(pet) => setModal({ kind: 'rename', petId: pet.id, back: 'mine' })}
        onEvolve={(pet) => setModal({ kind: 'evolve', petId: pet.id, back: 'mine' })}
      />
      <PetDetailModal
        pet={petFor(detailPetId)}
        onClose={closeModal}
        onAll={() => setModal({ kind: 'mine' })}
        onRename={(pet) => setModal({ kind: 'rename', petId: pet.id, back: 'detail' })}
        onEvolve={(pet) => setModal({ kind: 'evolve', petId: pet.id, back: 'detail' })}
      />
      <BuyConfirmModal species={modal.kind === 'buy' ? modal.species : null} onClose={() => setModal({ kind: 'shop' })} />
      <RenamePetModal pet={modal.kind === 'rename' ? petFor(modal.petId) : null} onClose={backFrom} />
      <EvolvePetModal pet={modal.kind === 'evolve' ? petFor(modal.petId) : null} onClose={backFrom} />
    </div>
  );
}
