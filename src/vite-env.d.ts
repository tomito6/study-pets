/// <reference types="vite/client" />

// Variáveis de ambiente que o app lê. Todas opcionais: sem elas, o app usa o
// projeto Firebase padrão (config pública) e persistência real.
interface ImportMetaEnv {
  /** 'firebase' (padrão) ou 'memory' — modo teste, sem rede, dados só na sessão. */
  readonly VITE_PERSISTENCE?: 'firebase' | 'memory';
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
