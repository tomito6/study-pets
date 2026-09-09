// Formato do documento salvo em `users/{uid}` e a ponte entre ele e o estado do app.
//
// Duas funções puras:
// - `hydrateUserDoc`: documento cru (possivelmente antigo, com campos faltando) → estado.
//   É a função explícita de migração: tudo que o Firestore já tem precisa passar por aqui.
// - `serializeState`: estado → documento pra salvar.
//
// `SCHEMA_VERSION` é gravado no doc. Docs sem o campo são v0 — o formato de antes
// da migração pro Vite; v1 tinha pets por espécie (`owned: ['cat']`, `xp: {cat: 120}`,
// `skills.owl`); v2 tem pets como instâncias, com nome, caminho e skill próprios;
// v3 tirou o almoço da config (`lunch`/`lunchDur`/`hasLunch` + `lunchOverrides`) —
// virou uma série diária de evento sem XP, convertida na leitura; v4 tirou a lista
// de sites de dentro do hardcore (`config.hardcore.{mode,sites}`) e a pôs em
// `config.siteBlock`, que vale com ou sem hardcore. Todos são lidos.

import { DEFAULT_AVATAR, normalizeAvatar } from './avatar';
import type { AvatarConfig } from './avatar';
import { DEFAULT_CFG, migrateConfig } from './config';
import type { WindowOverrides } from './dayWindows';
import { LUNCH_SERIES_ID, migrateLunch } from './eventPresets';
import type { LegacyLunch } from './eventPresets';
import { DEFAULT_GROUP_NAME } from './groups';
import { normalizeHardcoreConfig, normalizePenalties } from './hardcore';
import { migrateSiteBlock } from './siteBlock';
import { legacyPetInstance, normalizePetInstance, petForm } from './pets';
import { normalizeTutorialSeen } from './tutorial';
import type { TutorialSeen } from './tutorial';
import type {
  ChecksByDate,
  DateKey,
  GroupsByDate,
  PenaltiesByDate,
  PetInstance,
  PetInstanceId,
  RecurringEventSeries,
  StudyEvent,
  UserConfig,
} from './types';

export const SCHEMA_VERSION = 4;

export interface PetsState {
  owned: PetInstance[];
  active: PetInstanceId | null;
  /**
   * ms de quando o pet ativo foi equipado. Junto com `skillActivatedAt`, fecha o
   * exploit de equipar no fim do bloco: o bônus só vale pra blocos que começam depois.
   */
  activeSince: number;
  /** Último dia já processado por `applyPendingPetXP`. `null` = ainda não inicializado. */
  xpProcessedUntil: DateKey | null;
}

/** A parte do `state` que vai pro Firestore. Nada de UI aqui. */
export interface PersistedState {
  checks: ChecksByDate;
  events: Record<DateKey, StudyEvent[]>;
  eventSeries: RecurringEventSeries[];
  closedDays: Record<DateKey, boolean>;
  config: UserConfig;
  pets: PetsState;
  coinsSpent: number;
  /** Grupos de estudo por dia (nome + objetivo num trecho). */
  groups: GroupsByDate;
  /** Janelas de estudo só de um dia; lista vazia = dia livre (ver domain/dayWindows.ts). */
  windowOverrides: WindowOverrides;
  /** Áreas cujo tour contextual já foi visto. Cancelar sessão NÃO zera — quem cancelou já conhece o app. */
  tutorialSeen: TutorialSeen;
  /** Desistências no modo hardcore, por dia (ver domain/hardcore.ts). */
  penalties: PenaltiesByDate;
  /**
   * A aparência do personagem (tom de pele, cor e penteado do cabelo). Fica fora
   * de `config` de propósito: é identidade, não regra do dia — "Cancelar sessão"
   * não mexe nela. Ver `domain/avatar.ts`.
   */
  avatar: AvatarConfig;
}

/**
 * Carimbo de quem escreveu o documento por último. `writer` identifica uma carga
 * da página (não o usuário): o snapshot que volta com o nosso próprio `writer` é
 * eco da nossa escrita. `writtenAt` é o relógio de quem escreveu — só serve pra
 * reconhecer a MESMA emissão de novo, nunca pra ordenar entre dispositivos.
 */
export interface DocMeta {
  writer: string;
  writtenAt: number;
}

/** O documento como é escrito. */
export interface UserDoc extends PersistedState {
  schemaVersion: number;
  meta?: DocMeta;
}

/** O carimbo de um documento cru, se ele tem um válido. */
export function readDocMeta(raw: unknown): DocMeta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const meta = (raw as { meta?: unknown }).meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const { writer, writtenAt } = meta as { writer?: unknown; writtenAt?: unknown };
  return typeof writer === 'string' && writer && typeof writtenAt === 'number' && Number.isFinite(writtenAt)
    ? { writer, writtenAt }
    : null;
}

export const emptyPets = (): PetsState => ({ owned: [], active: null, activeSince: 0, xpProcessedUntil: null });

/** Estado de uma conta nova (documento inexistente). */
export function emptyPersistedState(): PersistedState {
  return {
    checks: {},
    events: {},
    eventSeries: [],
    closedDays: {},
    config: { ...DEFAULT_CFG },
    pets: emptyPets(),
    coinsSpent: 0,
    groups: {},
    windowOverrides: {},
    tutorialSeen: {},
    penalties: {},
    avatar: { ...DEFAULT_AVATAR },
  };
}

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Instância salva no formato v2, com defaults pra qualquer campo que falte, já no catálogo atual. */
function hydratePetInstance(raw: Raw): PetInstance {
  const pet = normalizePetInstance({
    id: raw.id as string,
    species: raw.species as string,
    name: str(raw.name) ?? '',
    xp: num(raw.xp),
    path: str(raw.path),
    stage: Math.max(0, Math.floor(num(raw.stage))),
    skill: str(raw.skill),
    skillActivatedAt: num(raw.skillActivatedAt),
    adoptedAt: num(raw.adoptedAt),
  });
  return pet.name ? pet : { ...pet, name: petForm(pet).name };
}

/** `pets` em qualquer formato que já existiu → instâncias. */
function hydratePets(d: Raw): PetsState {
  const pets = isObj(d.pets) ? d.pets : {};
  // v0/v1: XP por espécie e a skill da coruja moravam fora da instância.
  const legacyXp = isObj(pets.xp) ? pets.xp : {};
  const legacySkills = isObj(d.skills) ? d.skills : null;

  const owned: PetInstance[] = [];
  if (Array.isArray(pets.owned)) {
    for (const raw of pets.owned) {
      if (typeof raw === 'string') {
        const skill = raw === 'owl' && legacySkills ? str(legacySkills.owl) : null;
        owned.push(legacyPetInstance(raw, num(legacyXp[raw]), skill, skill && legacySkills ? num(legacySkills.activatedAt) : 0));
      } else if (isObj(raw) && typeof raw.id === 'string' && typeof raw.species === 'string') {
        owned.push(hydratePetInstance(raw));
      }
    }
  }

  const active = str(pets.active);
  return {
    owned,
    active: active && owned.some((p) => p.id === active) ? active : null,
    activeSince: num(pets.activeSince),
    xpProcessedUntil: typeof pets.xpProcessedUntil === 'string' ? pets.xpProcessedUntil : null,
  };
}

/** Grupos: só entradas com id/start/end de verdade; nome e objetivo ganham default. */
function hydrateGroups(raw: unknown): GroupsByDate {
  if (!isObj(raw)) return {};
  const out: GroupsByDate = {};
  for (const [day, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    const groups = list.filter(isObj).flatMap((g) =>
      typeof g.id === 'string' && typeof g.start === 'string' && typeof g.end === 'string'
        ? [{
            id: g.id,
            start: g.start,
            end: g.end,
            name: typeof g.name === 'string' && g.name.trim() ? g.name : DEFAULT_GROUP_NAME,
            goal: typeof g.goal === 'string' ? g.goal : '',
          }]
        : [],
    );
    if (groups.length > 0) out[day] = groups;
  }
  return out;
}

/** Janelas por dia: só entradas com `studyWindows` em lista; janela sem start/end de texto cai fora. */
function hydrateWindowOverrides(raw: unknown): WindowOverrides {
  if (!isObj(raw)) return {};
  const out: WindowOverrides = {};
  for (const [day, v] of Object.entries(raw)) {
    if (!isObj(v) || !Array.isArray(v.studyWindows)) continue;
    const studyWindows = v.studyWindows
      .filter(isObj)
      .flatMap((w) => (typeof w.start === 'string' && typeof w.end === 'string' ? [{ start: w.start, end: w.end }] : []));
    out[day] = { studyWindows };
  }
  return out;
}

/**
 * Lê um documento cru com tolerância a tudo que já existiu no Firestore: campos
 * ausentes, config sem `studyWindows`, checks como `true`, pets por espécie, etc.
 */
export function hydrateUserDoc(raw: unknown): PersistedState {
  const d: Raw = isObj(raw) ? raw : {};
  const rawCfg = isObj(d.config) ? d.config : {};
  const events: Record<DateKey, StudyEvent[]> = isObj(d.events) ? { ...(d.events as Record<DateKey, StudyEvent[]>) } : {};
  const eventSeries: RecurringEventSeries[] = Array.isArray(d.eventSeries) ? [...(d.eventSeries as RecurringEventSeries[])] : [];

  // v0–v2: o almoço morava na config (com ajustes por dia em `lunchOverrides`). Vira uma série
  // diária sem XP — sem âncora, pra cobrir os dias já passados — mais um avulso em cada dia
  // editado. Só pra doc que tem config de verdade: `{}` continua sendo conta nova.
  if (num(d.schemaVersion) < 3 && isObj(d.config) && !eventSeries.some((s) => s.id === LUNCH_SERIES_ID)) {
    const m = migrateLunch({
      hasLunch: rawCfg.hasLunch !== false, // o default antigo era almoçar
      lunch: str(rawCfg.lunch) ?? '13:00',
      lunchDur: num(rawCfg.lunchDur, 60),
      overrides: isObj(d.lunchOverrides) ? (d.lunchOverrides as LegacyLunch['overrides']) : {},
    });
    if (m.series) eventSeries.push(m.series);
    for (const [day, evs] of Object.entries(m.events)) events[day] = [...(events[day] ?? []), ...evs];
  }

  return {
    checks: (d.checks as ChecksByDate) || {},
    events,
    eventSeries,
    // Migra ANTES de aplicar os defaults: se o doc antigo só tem start/end, a janela
    // nasce deles. (O código original fazia ao contrário e a janela padrão 09–18
    // engolia os horários reais do usuário — corrigido na Fase 4.)
    // `hardcore` sempre normalizado: doc de antes do modo (sem o campo) fica desligado.
    // `siteBlock` vem do próprio campo (v4) ou da lista que morava no hardcore (v0–v3).
    config: {
      ...DEFAULT_CFG,
      ...migrateConfig(rawCfg),
      hardcore: normalizeHardcoreConfig(rawCfg.hardcore),
      siteBlock: migrateSiteBlock(rawCfg.siteBlock, rawCfg.hardcore),
    } as UserConfig,
    pets: hydratePets(d),
    closedDays: isObj(d.closedDays) ? (d.closedDays as Record<DateKey, boolean>) : {},
    coinsSpent: typeof d.coinsSpent === 'number' ? d.coinsSpent : 0,
    groups: hydrateGroups(d.groups),
    windowOverrides: hydrateWindowOverrides(d.windowOverrides),
    // Doc de antes do tour: vazio, então a conta que já existe também vê o tour uma vez.
    tutorialSeen: normalizeTutorialSeen(d.tutorialSeen),
    avatar: normalizeAvatar(d.avatar),
    penalties: normalizePenalties(d.penalties),
  };
}

/** Monta o documento a salvar. Só o formato atual — a leitura é que tolera os antigos. */
export function serializeState(s: PersistedState): UserDoc {
  const pets = s.pets || emptyPets();
  return {
    schemaVersion: SCHEMA_VERSION,
    checks: s.checks,
    events: s.events,
    eventSeries: s.eventSeries || [],
    closedDays: s.closedDays || {},
    config: s.config,
    pets: {
      owned: pets.owned || [],
      active: pets.active || null,
      activeSince: pets.activeSince || 0,
      xpProcessedUntil: pets.xpProcessedUntil ?? null,
    },
    coinsSpent: s.coinsSpent || 0,
    groups: s.groups || {},
    windowOverrides: s.windowOverrides || {},
    tutorialSeen: s.tutorialSeen || {},
    avatar: normalizeAvatar(s.avatar),
    penalties: s.penalties || {},
  };
}
