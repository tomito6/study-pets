// "Bem-vindo!" em três passos: (1) o personagem — quem vai estudar; (2) o pet
// inicial — qualquer espécie, de graça, com nome; (3) as JANELAS DE ESTUDO e os
// fins de semana. Os dois primeiros só aparecem quando o usuário ainda não tem pet
// (conta nova ou sessão recomeçada); quem já tem cai direto nas janelas.
// Sem botão de fechar — só "Continuar" / "Começar".
//
// O passo 3 pedia duas DATAS ("período de uso") e nunca perguntava o horário: todo
// mundo herdava 09:00–18:00, 16 pomodoros, 6h40 de estudo, sem ter escolhido. As
// datas foram pras Configurações — lá elas já vêm com a frase que explica pra que
// servem, que aqui nunca existiu.
//
// A aparência fica num `useState` até o fim: aplicá-la na hora salvaria o
// documento antes do onboarding terminar, e um reload pularia o pet inicial.

import { useEffect, useState } from 'react';
import { finishOnboarding } from '../../application/onboarding';
import { DEFAULT_AVATAR } from '../../domain/avatar';
import type { AvatarConfig } from '../../domain/avatar';
import { PET_LIST, normalizePetName, speciesForm, suggestPetName } from '../../domain/pets';
import { generateBlocks } from '../../domain/planner';
import { formatWindowDuration, nextWindowAfter } from '../../domain/settings';
import { blockMins } from '../../domain/time';
import type { PetSpecies, StudyWindow } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { state, useAppState } from '../../store/store';
import { AvatarControls } from '../avatar/AvatarControls';
import { NameField } from '../pets/NameField';
import { StudyWindowsEditor } from '../settings/StudyWindowsEditor';
import { useSpriteFrame } from '../profile/useSpriteFrame';

const t = strings.onboarding;
const traits = strings.pets.traits as Record<string, string | undefined>;
type Step = 'avatar' | 'starter' | 'windows';

/** "Passo N de 3" — quem tem pet pula os dois primeiros, e aí é um passo só. */
function StepMark({ i, total }: { i: number; total: number }) {
  if (total < 2) return null;
  return <div className="onb-step" id="onb-step">{t.stepOf(i, total)}</div>;
}

function AvatarStep({ value, onChange, onNext }: {
  value: AvatarConfig;
  onChange: (patch: Partial<AvatarConfig>) => void;
  onNext: () => void;
}) {
  return (
    <>
      <StepMark i={1} total={3} />
      <div className="panel-header"><h2>{t.avatarTitle}</h2></div>
      <p className="onb-intro">{t.avatarIntro}</p>
      <div className="av-card onb-avatar" id="onb-avatar">
        <AvatarControls value={value} onChange={onChange} active previewId="onb-avatar-preview" />
      </div>
      <div className="btn-row">
        <button className="save-btn" id="onb-avatar-next" onClick={onNext} style={{ width: '100%' }}>{t.next}</button>
      </div>
    </>
  );
}

function StarterStep({ species, name, onPick, onName, onNext, onBack }: {
  species: PetSpecies | null;
  name: string;
  onPick: (s: PetSpecies) => void;
  onName: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const frame = useSpriteFrame(4, true);
  const ready = !!species && normalizePetName(name) !== null;
  return (
    <>
      <StepMark i={2} total={3} />
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
      <button type="button" className="onb-back" id="onb-avatar-back" onClick={onBack}>{t.avatarBack}</button>
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
  const [step, setStep] = useState<Step>('windows');
  const [avatar, setAvatar] = useState<AvatarConfig>(DEFAULT_AVATAR);
  const [species, setSpecies] = useState<PetSpecies | null>(null);
  const [name, setName] = useState('');
  const [windows, setWindows] = useState<StudyWindow[]>([]);
  const [skip, setSkip] = useState(false);
  /** A declaração de idade do último passo. Destrava o botão que cria a conta. */
  const [idade, setIdade] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(starterNeeded ? 'avatar' : 'windows');
    setAvatar(state.avatar);
    setSpecies(null);
    setName('');
    setWindows(config.studyWindows?.length ? config.studyWindows.map((w) => ({ ...w })) : [{ start: '09:00', end: '18:00' }]);
    setSkip(config.skipWeekends === true);
    // `starterNeeded` de propósito fora: abrir é o que reinicia os passos, não ganhar um pet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, config.studyWindows, config.skipWeekends]);

  const patchAvatar = (patch: Partial<AvatarConfig>) => setAvatar((a) => ({ ...a, ...patch }));

  const pick = (s: PetSpecies) => {
    setSpecies(s);
    setName(suggestPetName(s));
  };

  const addWindow = () => setWindows((ws) => [...ws, nextWindowAfter(ws)]);

  // O que essas faixas viram, antes de confirmar: dá pra ver que 09:00–18:00 são
  // 16 pomodoros e mexer nisso agora, em vez de descobrir na primeira tela.
  const preview = (() => {
    const valid = windows.filter((w) => w.start && w.end && w.end > w.start);
    if (!valid.length) return null;
    const blocks = generateBlocks({ ...state.config, studyWindows: valid, start: valid[0]!.start, end: valid[valid.length - 1]!.end }, []);
    const study = blocks.filter((b) => b.type === 'estudo');
    if (!study.length) return null;
    return { pomos: study.length, mins: study.reduce((acc, b) => acc + blockMins(b), 0) };
  })();

  const begin = () => {
    const r = finishOnboarding({
      studyWindows: windows,
      skipWeekends: skip,
      starter: species ? { species: species.id, name } : null,
      avatar: starterNeeded ? avatar : null,
      ageConfirmed: idade,
    });
    if (r.ok) return;
    if (r.reason === 'age-unconfirmed') showToast(t.ageConfirm);
    else if (r.reason === 'empty') showToast(t.windowsEmpty);
    else if (r.reason === 'overlap') showToast(t.windowsOverlap);
    else if (r.reason === 'invalid-window') showToast(t.windowsInvalid);
    else {
      showToast(t.starterMissing);
      setStep('starter');
    }
  };

  return (
    <div className={'panel-overlay center' + (open ? ' open' : '')} id="onboarding-panel">
      <div className="panel-sheet">
        {open && step === 'avatar' ? (
          <AvatarStep value={avatar} onChange={patchAvatar} onNext={() => setStep('starter')} />
        ) : open && step === 'starter' ? (
          <StarterStep
            species={species}
            name={name}
            onPick={pick}
            onName={setName}
            onNext={() => setStep('windows')}
            onBack={() => setStep('avatar')}
          />
        ) : (
          <>
            <StepMark i={3} total={starterNeeded ? 3 : 1} />
            <div className="panel-header"><h2>{t.windowsTitle}</h2></div>
            <p className="onb-intro">{t.windowsIntro}</p>
            <div className="field-group">
              <StudyWindowsEditor id="onb-windows" windows={windows} onChange={setWindows} />
              <button type="button" className="ghost-btn" id="onb-windows-add" onClick={addWindow} style={{ marginTop: 8 }}>{t.windowsAdd}</button>
              <div className="onb-windows-preview" id="onb-windows-preview">
                {preview ? t.windowsPreview(preview.pomos, formatWindowDuration(preview.mins)) : t.windowsPreviewNone}
              </div>
            </div>
            <div className="field-group">
              <div className="checkbox-row">
                <input type="checkbox" id="onb-skip-weekends" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
                <label htmlFor="onb-skip-weekends" style={{ fontSize: 13 }}>{t.skipWeekends}</label>
              </div>
            </div>
            {/* A declaração de idade. Fica no último passo, colada no botão que cria a
                conta, porque é aí que ela vale — e o "por quê" vem junto, com link, em vez
                de uma caixa seca que ninguém entende. */}
            <div className="field-group">
              <div className="checkbox-row">
                <input type="checkbox" id="onb-age" checked={idade} onChange={(e) => setIdade(e.target.checked)} />
                <label htmlFor="onb-age" style={{ fontSize: 13 }}>{t.ageConfirm}</label>
              </div>
              <div className="onb-age-why">
                {t.ageWhy}{' '}
                <a href="/legal/privacidade.html" target="_blank" rel="noreferrer">{strings.login.legal.privacy}</a>
                {' · '}
                <a href="/legal/termos.html" target="_blank" rel="noreferrer">{strings.login.legal.terms}</a>
              </div>
            </div>
            {starterNeeded && (
              <button type="button" className="onb-back" onClick={() => setStep('starter')}>{t.back}</button>
            )}
            <div className="btn-row">
              <button className="save-btn" id="onb-begin" onClick={begin} disabled={!idade} style={{ width: '100%' }}>{t.begin}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
