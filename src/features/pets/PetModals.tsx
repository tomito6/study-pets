// Loja, "Meus pets", a confirmação de adoção (com o nome), renomear e evoluir.
// Filhos do ProfileTab, que guarda qual está aberto.

import { useState } from 'react';
import { buyPet, evolvePet, renamePet } from '../../application/pets';
import { PET_LIST, evolutionOf, normalizePetName, speciesForm, suggestPetName } from '../../domain/pets';
import { SKILLS } from '../../domain/progression';
import type { PetForm, PetInstance, PetSpecies } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { useAppState } from '../../store/store';
import { Modal } from '../shell/Modal';
import { NameField } from './NameField';
import { OwnedPetCard, PetSprite, ShopPetCard } from './PetCard';

const t = strings.pets;

interface ShopProps {
  open: boolean;
  balance: number;
  onClose: () => void;
  onAdopt: (species: PetSpecies) => void;
}

export function PetShopModal({ open, balance, onClose, onAdopt }: ShopProps) {
  return (
    <Modal id="pets-shop-panel" open={open} title={t.shopTitle} onClose={onClose}>
      <div className="shop-grid" id="pets-shop">
        {PET_LIST.map((species) => <ShopPetCard key={species.id} species={species} balance={balance} onAdopt={onAdopt} />)}
      </div>
    </Modal>
  );
}

interface MineProps {
  open: boolean;
  onClose: () => void;
  onRename: (pet: PetInstance) => void;
  onEvolve: (pet: PetInstance) => void;
}

export function MyPetsModal({ open, onClose, onRename, onEvolve }: MineProps) {
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
          owned.map((pet) => <OwnedPetCard key={pet.id} pet={pet} onRename={onRename} onEvolve={onEvolve} />)
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- adotar

interface BuyProps {
  species: PetSpecies | null;
  onClose: () => void;
}

/** O corpo é um componente à parte, com `key` por espécie: o nome sugerido nasce com ele. */
function BuyConfirmBody({ species, onClose }: { species: PetSpecies; onClose: () => void }) {
  const form = speciesForm(species);
  const [name, setName] = useState(() => suggestPetName(species));
  const valid = normalizePetName(name) !== null;

  const confirm = () => {
    const r = buyPet(species.id, name);
    if (r === 'invalid-name') return;
    if (r === 'insufficient') showToast(t.insufficient);
    if (r === 'ok') showToast(t.adopted(normalizePetName(name)!));
    onClose();
  };

  return (
    <>
      <div className="buy-confirm-body" id="buy-confirm-body">
        <PetSprite form={form} />
        <div className="buy-confirm-text">
          {t.buyText[0]}<b>{form.name}</b>{t.buyText[1]}<b>{species.price}</b>{t.buyText[2]}
        </div>
        <NameField id="pet-name-input" value={name} onChange={setName} onDice={() => setName(suggestPetName(species))} />
      </div>
      <div className="btn-row">
        <button className="reset-btn" onClick={onClose}>{t.cancel}</button>
        <button className="save-btn" onClick={confirm} disabled={!valid}>{t.adopt}</button>
      </div>
    </>
  );
}

export function BuyConfirmModal({ species, onClose }: BuyProps) {
  return (
    <Modal id="pet-buy-confirm" open={!!species} title={t.buyTitle} onClose={onClose}>
      {species && <BuyConfirmBody key={species.id} species={species} onClose={onClose} />}
    </Modal>
  );
}

// ---------------------------------------------------------------- renomear

interface PetModalProps {
  pet: PetInstance | null;
  onClose: () => void;
}

function RenameBody({ pet, onClose }: { pet: PetInstance; onClose: () => void }) {
  const [name, setName] = useState(pet.name);
  const valid = normalizePetName(name) !== null;
  const save = () => {
    if (renamePet(pet.id, name)) onClose();
  };
  return (
    <>
      <NameField id="pet-rename-input" value={name} onChange={setName} />
      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="reset-btn" onClick={onClose}>{t.cancel}</button>
        <button className="save-btn" onClick={save} disabled={!valid}>{t.save}</button>
      </div>
    </>
  );
}

export function RenamePetModal({ pet, onClose }: PetModalProps) {
  return (
    <Modal id="pet-rename-panel" open={!!pet} title={t.renameTitle} onClose={onClose}>
      {pet && <RenameBody key={pet.id} pet={pet} onClose={onClose} />}
    </Modal>
  );
}

// ---------------------------------------------------------------- evoluir

function PathCard({ form, sub, desc, selected, onSelect }: { form: PetForm; sub?: string; desc?: string; selected: boolean; onSelect?: () => void }) {
  const skills = form.skills.map((id) => SKILLS[id]?.name).filter(Boolean).join(' · ');
  return (
    <button type="button" className={'evo-path' + (selected ? ' selected' : '')} onClick={onSelect} disabled={!onSelect}>
      <PetSprite form={form} />
      <div className="evo-path-name">{form.name}</div>
      {sub && <div className="evo-path-sub">{sub}</div>}
      {desc && <div className="evo-path-desc">{desc}</div>}
      {skills && <div className="evo-path-skills">{skills}</div>}
    </button>
  );
}

function EvolveBody({ pet, onClose }: { pet: PetInstance; onClose: () => void }) {
  const evo = evolutionOf(pet);
  const [chosen, setChosen] = useState<string | null>(null);
  if (!evo || evo.kind === 'locked') return null;

  const targetForm = evo.kind === 'advance' ? evo.form : evo.options.find((o) => o.path.id === chosen)?.form ?? null;
  const confirm = () => {
    const r = evolvePet(pet.id, evo.kind === 'choose' ? chosen ?? undefined : undefined);
    if (r === 'ok' && targetForm) showToast(t.evolved(pet.name, targetForm.name));
    onClose();
  };

  return (
    <>
      <p className="evo-intro">{evo.kind === 'choose' ? t.evolveChoose : t.evolveAdvance(evo.form.name)}</p>
      {evo.kind === 'choose' ? (
        <div className="evo-paths">
          {evo.options.map((o) => (
            <PathCard key={o.path.id} form={o.form} sub={o.path.name} desc={o.path.desc} selected={chosen === o.path.id} onSelect={() => setChosen(o.path.id)} />
          ))}
        </div>
      ) : (
        <div className="evo-paths single">
          <PathCard form={evo.form} selected />
        </div>
      )}
      <div className="btn-row">
        <button className="reset-btn" onClick={onClose}>{t.cancel}</button>
        <button className="save-btn" onClick={confirm} disabled={!targetForm}>{t.evolveConfirm}</button>
      </div>
    </>
  );
}

export function EvolvePetModal({ pet, onClose }: PetModalProps) {
  return (
    <Modal id="pet-evolve-panel" open={!!pet} title={pet ? t.evolveTitle(pet.name) : ''} onClose={onClose}>
      {pet && <EvolveBody key={pet.id} pet={pet} onClose={onClose} />}
    </Modal>
  );
}
