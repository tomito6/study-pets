// A rede de segurança, e o caminho de volta.
//
// O app tinha um botão que baixa um JSON e nenhum caminho de volta: quem baixasse e depois
// apagasse ficava com um arquivo que não servia pra nada. Pior que isso, a mensagem "baixe
// seus dados antes" joga no usuário uma responsabilidade que é nossa — num app cujo
// princípio é nunca fazer a pessoa se sentir mal por mudar de ideia.
//
// Então são duas coisas separadas:
//
// 1. A REDE DE SEGURANÇA (`SafetyNet`), automática. Antes de apagar o histórico, o estado
//    inteiro é guardado dentro do próprio documento do usuário, e dá pra voltar atrás por
//    30 dias. Ninguém precisa lembrar de nada.
// 2. O CAMINHO DE VOLTA manual (`readBackup`), pra quem tem um arquivo baixado — de outro
//    aparelho, de outra conta, de antes de um acidente.
//
// O que a rede de segurança NÃO cobre, de propósito: apagar a CONTA. Ali a promessa é que
// não sobra nada, e a política de privacidade diz isso. Guardar uma cópia escondida de quem
// pediu para ser esquecido seria quebrar a promessa e o art. 17 junto.

import type { UserDoc } from './persistence';

/** Por quanto tempo dá pra desfazer. Depois disso a cópia é descartada sozinha, na leitura. */
export const SAFETY_NET_DAYS = 30;

const DIA_MS = 86_400_000;

/** O estado de antes de uma ação destrutiva, guardado no próprio documento. */
export interface SafetyNet {
  /** ms de quando o histórico foi apagado. */
  at: number;
  /** O documento como ele era, um instante antes. */
  doc: UserDoc;
}

export const safetyNetOf = (doc: UserDoc, at: number): SafetyNet => ({ at, doc });

/** ms do instante em que a rede deixa de valer. */
export const safetyNetExpiry = (net: SafetyNet): number => net.at + SAFETY_NET_DAYS * DIA_MS;

export const safetyNetExpired = (net: SafetyNet, now: Date): boolean =>
  now.getTime() >= safetyNetExpiry(net);

/** Dias inteiros que ainda restam (0 quando é hoje que vence). */
export function safetyNetDaysLeft(net: SafetyNet, now: Date): number {
  const falta = safetyNetExpiry(net) - now.getTime();
  return falta <= 0 ? 0 : Math.floor(falta / DIA_MS);
}

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Lê a forma do que veio do documento — só a forma. O prazo é checado por
 * `safetyNetExpired`, que recebe o "agora" de fora, porque o domínio não olha o relógio
 * sozinho. Quem descarta a rede vencida é `application/backup.ts`, no boot.
 */
export function parseSafetyNet(raw: unknown): SafetyNet | null {
  if (!ehObjeto(raw)) return null;
  const at = typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : 0;
  if (!at || !ehObjeto(raw.doc)) return null;
  return { at, doc: raw.doc as unknown as UserDoc };
}

export type BackupRefusal = 'nao-e-json' | 'nao-e-do-study-pets' | 'vazio';
export type BackupRead = { ok: true; doc: UserDoc } | { ok: false; reason: BackupRefusal };

/** Os campos que só um documento do Study Pets tem. Basta um pra reconhecer o arquivo. */
const MARCAS = ['checks', 'config', 'pets', 'events', 'eventSeries', 'schemaVersion'] as const;

/**
 * Um arquivo escolhido pelo usuário vira documento — ou uma recusa com motivo.
 *
 * A validação existe porque `hydrateUserDoc` é tolerante de propósito (ela aceita todo
 * formato antigo). Sem um portão antes dela, escolher a foto errada não daria erro: daria
 * um estado vazio, gravado por cima do histórico de verdade.
 */
export function readBackup(texto: string): BackupRead {
  const limpo = texto.trim();
  if (!limpo) return { ok: false, reason: 'vazio' };
  let cru: unknown;
  try {
    cru = JSON.parse(limpo);
  } catch {
    return { ok: false, reason: 'nao-e-json' };
  }
  if (!ehObjeto(cru)) return { ok: false, reason: 'nao-e-do-study-pets' };
  if (!MARCAS.some((m) => m in cru)) return { ok: false, reason: 'nao-e-do-study-pets' };
  // O documento cru vai pro `hydrateUserDoc`, que é quem tolera formato antigo e
  // preenche o que falta — aqui só se confirma que é o arquivo certo.
  return { ok: true, doc: cru as unknown as UserDoc };
}
