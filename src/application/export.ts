// "Baixar meus dados": o documento inteiro do usuário, como é salvo, num JSON.
// É a resposta pra "quero meus dados" — e substitui o snippet do DevTools
// (scripts/backup-firestore-console.js) pra quem não é o autor. Sem uid nem
// e-mail: o documento não tem, e não é acrescentado. Importar fica de fora
// até alguém pedir.

import { serializeState } from '../domain/persistence';
import type { UserDoc } from '../domain/persistence';
import { dk } from '../domain/time';
import { downloadText } from '../infrastructure/download';
import { state } from '../store/store';

export interface ExportedData extends UserDoc {
  /** ISO 8601 de quando o arquivo foi gerado. */
  exportedAt: string;
}

export const exportFilename = (now: Date): string => `study-pets-${dk(now)}.json`;

/** Monta o arquivo (puro em relação ao DOM) — o que o download entrega. */
export function buildExport(now: Date = new Date()): ExportedData {
  return { ...serializeState(state), exportedAt: now.toISOString() };
}

/** Dispara o download. Devolve `false` se o ambiente não tem como baixar. */
export function exportMyData(now: Date = new Date()): boolean {
  return downloadText(exportFilename(now), JSON.stringify(buildExport(now), null, 2));
}
