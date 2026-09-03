// Campo de nome do pet: usado ao adotar, ao renomear e no pet inicial do onboarding.
// Valida em tempo real; o 🎲 sorteia outra sugestão.

import { PET_NAME_MAX, normalizePetName } from '../../domain/pets';
import { strings } from '../../shared/strings';

const t = strings.pets;

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onDice?: () => void;
}

export function NameField({ id, value, onChange, onDice }: Props) {
  const invalid = normalizePetName(value) === null;
  return (
    <div className="pet-name-field">
      <label htmlFor={id}>{t.nameLabel}</label>
      <div className="pet-name-row">
        <input
          id={id}
          className="pet-name-input"
          type="text"
          maxLength={PET_NAME_MAX}
          placeholder={t.namePlaceholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
        {onDice && <button type="button" className="dice-btn" title={t.nameDice} aria-label={t.nameDice} onClick={onDice}>🎲</button>}
      </div>
      {invalid && <div className="pet-name-error">{t.nameInvalid}</div>}
    </div>
  );
}
