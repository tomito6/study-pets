// Os dois modais do modo hardcore: o consentimento antes de entrar num bloco
// (custo escrito na cara, com a saída "só desta vez, sem hardcore") e a
// confirmação de desistir dentro do foco (a conta exata: XP e nível de cada um).
// Quem abre os dois é um clique local — estado do componente pai.

import { hardcoreQuitPreview, quitHardcore, startHardcore } from '../../application/hardcore';
import { activePet } from '../../application/pets';
import { tryStartTimer } from '../../application/timer';
import { penaltyFor } from '../../domain/hardcore';
import type { QuitCost } from '../../domain/hardcore';
import { blockDurationMin, cleanBlockName } from '../../domain/timer';
import type { StudyBlock } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { Modal } from '../shell/Modal';

const t = strings.hardcore;

interface StartProps {
  /** O bloco que o usuário tocou; null = fechado. */
  block: StudyBlock | null;
  onClose: () => void;
}

/** "🔥 Modo hardcore — Estudo 3 · 25 min. Sair antes do fim custa −100 XP…" */
export function HardcoreStartModal({ block, onClose }: StartProps) {
  const pet = activePet();
  const start = (hardcore: boolean) => {
    if (!block) return;
    const r = hardcore ? startHardcore(block) : tryStartTimer(block);
    if (!r.ok) showToast(strings.timer.refusal(r));
    onClose();
  };
  return (
    <Modal id="hardcore-start-confirm" open={!!block} title={t.start.title} onClose={onClose}>
      {block && (
        <>
          <div className="hc-start-block" id="hardcore-start-block">{t.start.block(cleanBlockName(block.name), blockDurationMin(block))}</div>
          <p className="hc-start-cost" id="hardcore-start-cost">{t.start.cost(penaltyFor(block), pet?.name ?? null)}</p>
          <p className="hc-start-rules">{t.start.rules}</p>
          <div className="btn-row">
            <button className="reset-btn" onClick={onClose}>{t.start.cancel}</button>
            <button className="save-btn hc-start-btn" id="hardcore-start-btn" onClick={() => start(true)}>{t.start.confirm}</button>
          </div>
          <button type="button" className="ghost-btn hc-start-normal" id="hardcore-start-normal" onClick={() => start(false)}>{t.start.normal}</button>
        </>
      )}
    </Modal>
  );
}

interface QuitProps {
  open: boolean;
  petName: string | null;
  blockName: string;
  onClose: () => void;
}

function costLines(cost: QuitCost, petName: string | null): string[] {
  const lines: string[] = [];
  lines.push(cost.userXp > 0 ? t.focus.quitUser(cost.userXp, cost.userLevelBefore, cost.userLevelAfter) : t.focus.quitUserNothing);
  if (petName && cost.petLevelBefore !== null && cost.petLevelAfter !== null) {
    lines.push(cost.petXp > 0 ? t.focus.quitPet(petName, cost.petXp, cost.petLevelBefore, cost.petLevelAfter) : t.focus.quitPetNothing(petName));
  }
  return lines;
}

/** "Desistir de Estudo 3? Você perde 100 XP… Bolt perde 100 XP e cai do Lv. 5 pro Lv. 4." */
export function HardcoreQuitModal({ open, petName, blockName, onClose }: QuitProps) {
  const cost = open ? hardcoreQuitPreview() : null;
  const confirm = () => {
    onClose();
    quitHardcore();
  };
  return (
    <Modal id="hardcore-quit-confirm" open={open} title={t.focus.quitTitle(blockName)} onClose={onClose}>
      {cost && (
        <>
          {costLines(cost, petName).map((line) => (
            <p key={line} className="hc-quit-line">{line}</p>
          ))}
          <p className="hc-quit-final">{t.focus.quitFinal}</p>
          <div className="btn-row">
            <button className="save-btn" onClick={onClose}>{t.focus.keepGoing}</button>
            <button className="danger-btn" id="hardcore-quit-btn" onClick={confirm}>{t.focus.quitConfirm}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
