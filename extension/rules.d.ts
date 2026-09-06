// Tipos de rules.js pro Vitest/tsc (a extensão é JS puro, sem build).

export interface HardcoreExtPayload {
  v: 1;
  active: boolean;
  until?: number;
  mode?: 'blacklist' | 'whitelist';
  sites?: string[];
  block?: { name: string; endTime: string };
  pet?: { name: string; form: string; emoji: string; sprites: string[] } | null;
  appUrl?: string;
}

export interface DnrRule {
  id: number;
  priority: number;
  action: { type: 'redirect'; redirect: { extensionPath: string } } | { type: 'allow' };
  condition: { requestDomains?: string[]; urlFilter?: string; resourceTypes: string[] };
}

export const ALWAYS_ALLOWED: string[];
export function hostOf(url: string): string | null;
export function domainMatches(host: string, site: string): boolean;
export function allowedFor(payload: HardcoreExtPayload): string[];
export function isBlocked(url: string, payload: HardcoreExtPayload | null | undefined): boolean;
export function buildRules(payload: HardcoreExtPayload | null | undefined): DnrRule[];
