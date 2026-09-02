// Config do projeto Firebase.
//
// Os valores abaixo são a config web pública do projeto — não são segredo (o
// browser de qualquer usuário os recebe). O que protege os dados são as regras do
// Firestore, não esconder a chave. Por isso ficam como padrão no código, e a
// Vercel não precisa de variável de ambiente nenhuma pra buildar.
//
// As variáveis VITE_FIREBASE_* existem pra apontar um ambiente de dev pra OUTRO
// projeto (ou pro emulador) sem tocar em produção. Ver .env.example.

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyABZ4DR7v94YyKaswY8FR7T8tOVQkIR7B0',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'plano-estudos-bf51d.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'plano-estudos-bf51d',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'plano-estudos-bf51d.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '807419074503',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:807419074503:web:905534d0f0ef64edf26be2',
};
