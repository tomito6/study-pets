// Loja, "Meus pets" e a confirmação de adoção. Filhos do ProfileTab.

import { useState } from 'react';
import { buyPet } from '../../application/pets';
import { PET_LIST, PETS } from '../../domain/pets';
import type { PetDefinition } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { useAppState } from '../../store/store';
import { Modal } from '../shell/Modal';
import { PetCard } from './PetCard';

const t = strings.pets;

interface GridProps {
  open: boolean;
  balance: number;
  onClose: () => void;
  onAdopt: (pet: PetDefinition) => void;
}

export function PetShopModal({ open, balance, onClose, onAdopt }: GridProps) {
  return (
    <Modal id="pets-shop-panel" open={open} title={t.shopTitle} onClose={onClose}>
      <div className="shop-grid" id="pets-shop">
        {PET_LIST.map((pet) => <PetCard key={pet.id} pet={pet} showPrice balance={balance} onAdopt={onAdopt} />)}
      </div>
    </Modal>
  );
}

export function MyPetsModal({ open, balance, onClose, onAdopt }: GridProps) {
  const owned = useAppState((s) => s.pets.owned);
  return (
    <Modal id="my-pets-panel" open={open} title={t.myPetsTitle} onClose={onClose}>
      <div className="shop-grid" id="my-pets-grid">
        {owned.length === 0 ? (
          <div className="my-pets-empty">
            <div className="mpe-icon">🐾</div>
            {t.empty[0]}
            <br />
            {t.empty[1]}
          </div>
        ) : (
          owned.map((id) => PETS[id]).filter((p): p is PetDefinition => !!p).map((pet) => (
            <PetCard key={pet.id} pet={pet} showPrice={false} balance={balance} onAdopt={onAdopt} />
          ))
        )}
      </div>
    </Modal>
  );
}

interface BuyProps {
  pet: PetDefinition | null;
  onClose: () => void;
}

export function BuyConfirmModal({ pet, onClose }: BuyProps) {
  const [spriteFailed, setSpriteFailed] = useState(false);
  const confirm = () => {
    if (!pet) return;
    const r = buyPet(pet.id);
    if (r === 'insufficient') showToast(t.insufficient);
    onClose();
  };
  return (
    <Modal id="pet-buy-confirm" open={!!pet} title={t.buyTitle} onClose={onClose}>
      <div className="buy-confirm-body" id="buy-confirm-body">
        {pet && (spriteFailed ? (
          <div className="buy-confirm-emoji">{pet.emoji}</div>
        ) : (
          <img className="buy-confirm-img" src={pet.sprite(0)} alt={pet.name} onError={() => setSpriteFailed(true)} />
        ))}
        {pet && (
          <div className="buy-confirm-text">
            {t.buyText[0]}<b>{pet.name}</b>{t.buyText[1]}<b>{pet.price}</b>{t.buyText[2]}
          </div>
        )}
      </div>
      <div className="btn-row">
        <button className="reset-btn" onClick={onClose}>{t.cancel}</button>
        <button className="save-btn" onClick={confirm}>{t.adopt}</button>
      </div>
    </Modal>
  );
}
