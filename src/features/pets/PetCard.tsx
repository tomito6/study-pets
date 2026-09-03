// Os cards de pet. `ShopPetCard` é a espécie à venda (preço + "Adotar");
// `OwnedPetCard` é o pet adotado, em "Meus pets" (nome, nível, forma, Equipar,
// evolução e skills). Sem sprite (pasta ainda não existe), cai no emoji.

import { useState } from 'react';
import { toggleEquip, toggleSkill } from '../../application/pets';
import { evolutionOf, petForm, petLevel, speciesForm } from '../../domain/pets';
import { SKILLS } from '../../domain/progression';
import type { PetForm, PetInstance, PetSpecies } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { useAppState } from '../../store/store';

const t = strings.pets;

/** Sprite parado (frame 0) com fallback no emoji. Mesmas classes da loja antiga. */
export function PetSprite({ form }: { form: PetForm }) {
  const [failed, setFailed] = useState(false);
  if (failed || !form.sprite(0)) return <div className="shop-item-emoji">{form.emoji}</div>;
  return <img className="shop-item-img" src={form.sprite(0)} alt={form.name} onError={() => setFailed(true)} />;
}

interface ShopProps {
  species: PetSpecies;
  balance: number;
  onAdopt: (species: PetSpecies) => void;
}

export function ShopPetCard({ species, balance, onAdopt }: ShopProps) {
  const form = speciesForm(species);
  const canAfford = balance >= species.price;
  const onButton = () => {
    if (!canAfford) {
      showToast(t.insufficient);
      return;
    }
    onAdopt(species);
  };
  return (
    <div className="shop-item">
      <PetSprite form={form} />
      <div className="shop-item-name-row">
        <span className="shop-item-name">{form.name}</span>
      </div>
      <div className="shop-item-price">{t.price(species.price)}</div>
      <button className={'shop-btn' + (canAfford ? '' : ' locked')} onClick={onButton}>{t.adopt}</button>
    </div>
  );
}

interface OwnedProps {
  pet: PetInstance;
  onRename: (pet: PetInstance) => void;
  onEvolve: (pet: PetInstance) => void;
}

export function OwnedPetCard({ pet, onRename, onEvolve }: OwnedProps) {
  const active = useAppState((s) => s.pets.active === pet.id);
  const form = petForm(pet);
  const evo = evolutionOf(pet);
  const skills = form.skills.map((id) => SKILLS[id]).filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <div className={'shop-item' + (active ? ' active-pet' : '')}>
      {active && <div className="shop-item-active-badge">{t.badgeActive}</div>}
      <PetSprite form={form} />
      <div className="shop-item-name-row">
        <span className="shop-item-name">{pet.name}</span>
        <span className="shop-item-lv">{t.lv(petLevel(pet))}</span>
      </div>
      <div className="shop-item-species">
        <span>{form.name}</span>
        <button type="button" className="shop-item-rename" title={t.rename} aria-label={t.rename} onClick={() => onRename(pet)}>✏️</button>
      </div>
      <button className={'shop-btn' + (active ? ' active' : ' owned')} onClick={() => toggleEquip(pet.id)}>
        {active ? t.equipped : t.equip}
      </button>
      {evo && evo.kind !== 'locked' && (
        <button type="button" className="shop-btn evolve" onClick={() => onEvolve(pet)}>{t.evolve}</button>
      )}
      {evo && evo.kind === 'locked' && <div className="shop-item-evo-hint">{t.evolveHint(evo.level)}</div>}
      {skills.length > 0 && (
        <div className="pet-skills-wrap">
          <div className="pet-skills-header">{t.skills}</div>
          {skills.map((skill) => {
            const on = pet.skill === skill.id;
            return (
              <button type="button" key={skill.id} className={'pet-skill-row' + (on ? ' active' : '')} onClick={() => toggleSkill(pet.id, skill.id)}>
                <span className="ps-info">
                  <span className="ps-name">{skill.name}</span>
                  <span className="ps-desc">{skill.desc}</span>
                </span>
                <span className={'ps-toggle' + (on ? ' on' : '')}><span className="ps-knob" /></span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
