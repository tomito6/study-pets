// Contratos que o app usa pra falar com o mundo externo (auth e persistência).
// O `main.js` só conhece estas interfaces — nunca o Firebase diretamente.

import type { UserDoc } from '../domain/persistence';

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
}

export type Unsubscribe = () => void;

export interface AuthPort {
  /** Chama `cb` com o usuário atual (ou null) agora e a cada mudança. */
  onAuthStateChanged(cb: (user: AuthUser | null) => void): Unsubscribe;
  currentUser(): AuthUser | null;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Apaga a conta do usuário logado. Se o provedor exigir login recente, chama
   * `onReauthRequired` (pra UI avisar) e reautentica antes de tentar de novo.
   * Falha com `DeleteAccountError`, cujo `stage` diz em que passo quebrou.
   */
  deleteCurrentUser(opts?: { onReauthRequired?: () => void }): Promise<void>;
}

export class DeleteAccountError extends Error {
  constructor(
    public readonly stage: 'delete' | 'reauth',
    public override readonly cause?: unknown,
  ) {
    super(`delete account failed at ${stage}`);
    this.name = 'DeleteAccountError';
  }
}

export interface UserRepository {
  /** Documento cru do usuário, ou null se a conta é nova. */
  load(uid: string): Promise<unknown | null>;
  /**
   * Substitui o documento inteiro pelo enviado. Chave que não vem some — é assim
   * que desmarcar um check, apagar o último evento ou o último grupo do dia
   * persistem. `serializeState` sempre monta o documento completo.
   */
  save(uid: string, doc: UserDoc): Promise<void>;
  /**
   * Chama `cb` com o documento cru toda vez que ele muda no servidor — vindo de
   * outro dispositivo ou desta mesma conta em outra aba. A própria escrita ainda
   * não confirmada não conta. A primeira emissão repete o doc atual; quem escuta
   * decide o que fazer (ver `application/sync.ts`).
   */
  subscribe(uid: string, cb: (raw: unknown) => void): Unsubscribe;
  delete(uid: string): Promise<void>;
  /** true quando os dados não sobrevivem a um reload (modo teste). */
  readonly ephemeral: boolean;
}

export interface Infra {
  auth: AuthPort;
  users: UserRepository;
}
