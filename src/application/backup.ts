// A rede de segurança e o caminho de volta (ver domain/backup.ts pro porquê).
//
// Tudo que restaura passa por `aplicar`: um documento cru vira estado, o plano é refeito e
// o save sai na hora. É o mesmo caminho do boot — `hydrateUserDoc` continua sendo a única
// função que sabe ler formato antigo, então um arquivo de meses atrás entra igual.

import { parseSafetyNet, readBackup, safetyNetExpired, safetyNetOf } from '../domain/backup';
import type { BackupRefusal, SafetyNet } from '../domain/backup';
import { hydrateUserDoc, serializeState } from '../domain/persistence';
import type { UserDoc } from '../domain/persistence';
import { readFileText } from '../infrastructure/fileText';
import { notify, state } from '../store/store';
import { clearBlockCache, rebuildWeeks } from './plan';
import { saveNow } from './save';

/**
 * O documento como ele está agora, sem a rede dentro. Sem esse `safetyNet: null` a cópia
 * conteria a cópia anterior, e o documento cresceria uma camada a cada apagamento.
 */
const semRede = (): UserDoc => ({ ...serializeState(state), safetyNet: null });

/** O instantâneo de antes de apagar. Quem chama é `cancelSession`, antes de zerar nada. */
export const takeSafetyNet = (now: Date = new Date()): SafetyNet => safetyNetOf(semRede(), now.getTime());

export type RestoreResult = { ok: true } | { ok: false; reason: RestoreRefusal };
export type RestoreRefusal = BackupRefusal | 'sem-usuario' | 'sem-rede' | 'vencida' | 'sem-arquivo';

/** Documento cru → estado. Salva na hora: restaurar não é coisa pra ficar num debounce. */
function aplicar(doc: UserDoc, now: Date): void {
  Object.assign(state, hydrateUserDoc(doc));
  // A rede que veio dentro do arquivo não é reaproveitada: ela descreve um apagamento
  // que aconteceu noutro contexto, e manter isso aninhado só engorda o documento.
  state.safetyNet = null;
  rebuildWeeks(now);
  clearBlockCache();
  void saveNow();
  notify();
}

/** Desfaz o "Apagar todo o histórico". */
export function restoreSafetyNet(now: Date = new Date()): RestoreResult {
  if (!state.user) return { ok: false, reason: 'sem-usuario' };
  const net = parseSafetyNet(state.safetyNet);
  if (!net) return { ok: false, reason: 'sem-rede' };
  if (safetyNetExpired(net, now)) {
    state.safetyNet = null;
    void saveNow();
    notify();
    return { ok: false, reason: 'vencida' };
  }
  aplicar(net.doc, now);
  return { ok: true };
}

/** "Não quero mais poder desfazer." Some na hora, sem esperar os 30 dias. */
export function discardSafetyNet(): void {
  if (!state.safetyNet) return;
  state.safetyNet = null;
  void saveNow();
  notify();
}

/**
 * No boot: a rede vencida some. Não há tarefa agendada nem varredura no servidor — o dado
 * que passou do prazo é descartado no primeiro acesso depois dele.
 */
export function dropExpiredSafetyNet(now: Date = new Date()): boolean {
  const net = parseSafetyNet(state.safetyNet);
  if (!net || !safetyNetExpired(net, now)) return false;
  state.safetyNet = null;
  void saveNow();
  notify();
  return true;
}

/** A rede que ainda vale, pra UI mostrar. `null` quando não há nada a desfazer. */
export function activeSafetyNet(now: Date = new Date()): SafetyNet | null {
  const net = parseSafetyNet(state.safetyNet);
  return net && !safetyNetExpired(net, now) ? net : null;
}

/** Um arquivo baixado volta a ser o estado. O portão contra o arquivo errado é `readBackup`. */
export async function importBackupFile(file: Blob | null, now: Date = new Date()): Promise<RestoreResult> {
  if (!state.user) return { ok: false, reason: 'sem-usuario' };
  if (!file) return { ok: false, reason: 'sem-arquivo' };
  const texto = await readFileText(file);
  if (texto == null) return { ok: false, reason: 'sem-arquivo' };
  const lido = readBackup(texto);
  if (!lido.ok) return { ok: false, reason: lido.reason };
  aplicar(lido.doc, now);
  return { ok: true };
}
