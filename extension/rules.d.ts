// Tipos de rules.js pro Vitest/tsc (a extensão é JS puro, sem build).
// O payload é o mesmo de `src/infrastructure/extensionBridge.ts` — se mudar lá,
// mude aqui.

export interface BlockingExtPayload {
  v: 2;
  active: boolean;
  reason?: 'stopped' | 'unknown';
  until?: number;
  mode?: 'blacklist' | 'whitelist';
  /** Já expandida com os apelidos pelo app; a extensão não interpreta nada. */
  sites?: string[];
  block?: { name: string; endTime: string } | null;
  pet?: { name: string; form: string; emoji: string; sprites: string[] } | null;
  appUrl?: string;
  hardcore?: boolean;
  test?: boolean;
}

export interface BlockingExtAck {
  applied: boolean;
  until: number;
  sites: number;
  mode: 'blacklist' | 'whitelist' | null;
  test: boolean;
}

export interface DnrRule {
  id: number;
  priority: number;
  action: { type: 'redirect'; redirect: { extensionPath: string } } | { type: 'allow' };
  condition: { requestDomains?: string[]; urlFilter?: string; resourceTypes: string[] };
}

export const ALWAYS_ALLOWED: string[];
export const PAYLOAD_VERSION: 2;
export function hostOf(url: string): string | null;
export function domainMatches(host: string, site: string): boolean;
export function allowedFor(payload: BlockingExtPayload): string[];
export function isSupported(payload: unknown): boolean;
export function isLive(state: BlockingExtPayload | null | undefined, now: number): boolean;
export function isBlocked(url: string, payload: BlockingExtPayload | null | undefined): boolean;
export function buildRules(payload: BlockingExtPayload | null | undefined): DnrRule[];
export function ackFor(state: BlockingExtPayload | null | undefined): BlockingExtAck;
