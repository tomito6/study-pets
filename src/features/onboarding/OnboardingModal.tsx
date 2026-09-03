// "Bem-vindo!" em dois passos: (1) o pet inicial — qualquer espécie, de graça, com
// nome — só quando o usuário ainda não tem pet; (2) período de uso e fins de semana.
// Sem botão de fechar — só "Continuar" / "Começar".

import { useEffect, useState } from 'react';
import { finishOnboarding } from '../../application/onboarding';
import { PET_LIST, normalizePetName, speciesForm, suggestPetName } from '../../domain/pets';
import { dk } from '../../domain/time';
import type { PetSpecies } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { useAppState } from '../../store/store';
import { NameField } from '../pets/NameField';
import { useSpriteFrame } from '../profile/useSpriteFrame';

const t = strings.onboarding;
const traits = t.traits as Record<string, string | undefined>;
type Step = 'starter' | 'period';

function StarterStep({ species, name, onPick, onName, onNext }: {
  species: PetSpecies | null;
  name: string;
  onPick: (s: PetSpecies) => void;
  onName: (v: string) => void;
  onNext: () => void;
}) {
  const frame = useSpriteFrame(4, true);
  const ready = !!species && normalizePetName(name) !== null;
  return (
    <>
      <div className="panel-header"><h2>{t.starterTitle}</h2></div>
      <p className="onb-intro">{t.starterIntro}</p>
      <div className="starter-grid" id="starter-grid">
        {PET_LIST.map((s) => {
          const form = speciesForm(s);
          const selected = species?.id === s.id;
          return (
            <button type="button" key={s.id} className={'starter-card' + (selected ? ' selected' : '')} data-species={s.id} onClick={() => onPick(s)}>
              <img className="starter-sprite" src={form.sprite(frame)} alt={form.name} />
              <span className="starter-name">{form.name}</span>
              <span className="starter-trait">{traits[s.id] ?? ''}</span>
            </button>
          );
        })}
      </div>
      {species && <NameField id="starter-name" value={name} onChange={onName} onDice={() => onName(suggestPetName(species))} />}
      <p className="starter-notice">{t.starterNotice}</p>
      <div className="btn-row">
        <button className="save-btn" id="onb-next" onClick={onNext} disabled={!ready} style={{ width: '100%' }}>{t.next}</button>
      </div>
    </>
  );
}

export function OnboardingModal() {
  const { open, config, starterNeeded } = useAppState((s, d) => ({
    open: d.onboardingOpen,
    config: s.config,
    starterNeeded: s.pets.owned.length === 0,
  }));
  const [step, setStep] = useState<Step>('period');
  const [species, setSpecies] = useState<PetSpecies | null>(null);
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [skip, setSkip] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(starterNeeded ? 'starter' : 'period');
    setSpecies(null);
    setName('');
    setStart(config.periodStart || dk(new Date()));
    setEnd(config.periodEnd || '');
    setSkip(config.skipWeekends === true);
    // `starterNeeded` de propósito fora: abrir é o que reinicia os passos, não ganhar um pet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, config.periodStart, config.periodEnd, config.skipWeekends]);

  const pick = (s: PetSpecies) => {
    setSpecies(s);
    setName(suggestPetName(s));
  };

  const useAlways = () => {
    setStart(dk(new Date()));
    setEnd('');
    showToast(t.alwaysToast);
  };

  const begin = () => {
    const r = finishOnboarding({
      periodStart: start,
      periodEnd: end || null,
      skipWeekends: skip,
      starter: species ? { species: species.id, name } : null,
    });
    if (r.ok) return;
    if (r.reason === 'end-before-start') {
      showToast(t.endBeforeStart);
    } else {
      showToast(t.starterMissing);
      setStep('starter');
    }
  };

  return (
    <div className={'panel-overlay center' + (open ? ' open' : '')} id="onboarding-panel">
      <div className="panel-sheet">
        {open && step === 'starter' ? (
          <StarterStep species={species} name={name} onPick={pick} onName={setName} onNext={() => setStep('period')} />
        ) : (
          <>
            <div className="panel-header"><h2>{t.title}</h2></div>
            <p className="onb-intro">{t.intro}</p>
            <div className="field-group">
              <label>{t.period}</label>
              <div className="field-row">
                <div><div className="field-sublabel">{t.start}</div><input type="date" id="onb-start" value={start} onChange={(e) => setStart(e.target.value)} /></div>
                <div><div className="field-sublabel">{t.end}</div><input type="date" id="onb-end" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
              </div>
              <button type="button" className="ghost-btn" onClick={useAlways} style={{ marginTop: 8 }}>{t.useAlways}</button>
            </div>
            <div className="field-group">
              <div className="checkbox-row">
                <input type="checkbox" id="onb-skip-weekends" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
                <label htmlFor="onb-skip-weekends" style={{ fontSize: 13 }}>{t.skipWeekends}</label>
              </div>
            </div>
            {starterNeeded && (
              <button type="button" className="onb-back" onClick={() => setStep('starter')}>{t.back}</button>
            )}
            <div className="btn-row">
              <button className="save-btn" onClick={begin} style={{ width: '100%' }}>{t.begin}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
