// O card de um pet, compartilhado pela loja e por "Meus pets". Na loja mostra
// preço e "Adotar"; em "Meus pets" mostra nível, Equipar/Equipada e as skills.
// Sem sprite (pasta ainda não existe), cai no emoji.

import { useState } from 'react';
import { activeSkillOf, toggleEquip, toggleSkill } from '../../application/pets';
import { petLevel } from '../../domain/pets';
import type { PetDefinition } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { useAppState } from '../../store/store';

const t = strings.pets;

interface Props {
  pet: PetDefinition;
  showPrice: boolean;
  balance: number;
  onAdopt: (pet: PetDefinition) => void;
}

export function PetCard({ pet, showPrice, balance, onAdopt }: Props) {
  const { pets, skillsVersion } = useAppState((s) => ({ pets: s.pets, skillsVersion: s.skills?.activatedAt ?? 0 }));
  void skillsVersion; // só pra re-renderizar quando uma skill muda
  const [spriteFailed, setSpriteFailed] = useState(false);
  const owned = pets.owned.includes(pet.id);
  const active = pets.active === pet.id;
  const canAfford = balance >= pet.price;
  const locked = !owned && !canAfford;

  const onButton = () => {
    if (!owned) {
      if (!canAfford) {
        showToast(t.insufficient);
        return;
      }
      onAdopt(pet);
      return;
    }
    toggleEquip(pet.id);
  };

  const showSkills = !showPrice && owned && !!pet.skills?.length;

  return (
    <div className={'shop-item' + (active ? ' active-pet' : '')}>
      {active && <div className="shop-item-active-badge">{t.badgeActive}</div>}
      {spriteFailed ? (
        <div className="shop-item-emoji">{pet.emoji}</div>
      ) : (
        <img className="shop-item-img" src={pet.sprite(0)} alt={pet.name} onError={() => setSpriteFailed(true)} />
      )}
      <div className="shop-item-name-row">
        <span className="shop-item-name">{pet.name}</span>
        {owned && <span className="shop-item-lv">{t.lv(petLevel(pets, pet.id))}</span>}
      </div>
      {showPrice && !owned && <div className="shop-item-price">{t.price(pet.price)}</div>}
      <button
        className={'shop-btn' + (active ? ' active' : owned ? ' owned' : locked ? ' locked' : '')}
        onClick={onButton}
      >
        {active ? t.equipped : owned ? t.equip : t.adopt}
      </button>
      {showSkills && (
        <div className="pet-skills-wrap">
          <div className="pet-skills-header">{t.skills}</div>
          {pet.skills!.map((skill) => {
            const on = activeSkillOf(pet.id) === skill.id;
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
