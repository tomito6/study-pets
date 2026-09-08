/* Study Pets — backup do seu documento do Firestore, sem instalar nada.
 *
 * ATALHO: se você só quer os seus dados, o app já faz isso sozinho —
 * Configurações → Geral → Meus dados → "Baixar (JSON)". Este script existe pro
 * caso de você querer o documento cru, com uid e caminho, direto do servidor
 * (útil antes de mexer em schema, quando o app local pode estar quebrado).
 *
 * COMO USAR
 *   1. Abra https://plano-estudos-one.vercel.app e faça login normalmente.
 *   2. Abra o DevTools (F12) → aba Console.
 *   3. Cole este arquivo inteiro e dê Enter.
 *   4. Um arquivo study-pets-backup-AAAA-MM-DD.json é baixado.
 *
 * Desde a migração pro Vite o app importa o Firebase do bundle, não do gstatic —
 * então os módulos que o console carrega aqui são OUTRA instância e não enxergam
 * o app da página (`getApps()` volta vazio). A saída é subir uma instância nossa
 * com a mesma config pública: a sessão do Auth mora no IndexedDB do domínio,
 * chaveada por apiKey + nome do app, então o login da página é reaproveitado e
 * ninguém precisa entrar de novo.
 *
 * Rode isto ANTES de qualquer mudança de schema. É o seu rollback.
 */
(async () => {
  const V = 'https://www.gstatic.com/firebasejs/10.12.0';
  const { getApps, getApp, initializeApp } = await import(`${V}/firebase-app.js`);
  const { getAuth, onAuthStateChanged } = await import(`${V}/firebase-auth.js`);
  const { getFirestore, doc, getDoc } = await import(`${V}/firebase-firestore.js`);

  // Cópia da config pública de src/infrastructure/firebase/config.ts (não é segredo:
  // o browser de qualquer usuário recebe ela). Se mudar lá, mude aqui.
  const firebaseConfig = {
    apiKey: 'AIzaSyABZ4DR7v94YyKaswY8FR7T8tOVQkIR7B0',
    authDomain: 'plano-estudos-bf51d.firebaseapp.com',
    projectId: 'plano-estudos-bf51d',
    storageBucket: 'plano-estudos-bf51d.firebasestorage.app',
    messagingSenderId: '807419074503',
    appId: '1:807419074503:web:905534d0f0ef64edf26be2',
  };

  // Sem nome: o app padrão é o mesmo nome que a página usa, e é o nome que entra
  // na chave da sessão salva. Com nome próprio, o login não seria reaproveitado.
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);

  // O Auth restaura a sessão do IndexedDB de forma assíncrona: currentUser pode
  // estar null no primeiro instante mesmo com você logado. O unsubscribe fica pra
  // depois do await de propósito — se o callback disparasse na hora, chamá-lo lá
  // dentro esbarraria numa variável ainda não atribuída.
  let stop = null;
  const user = await new Promise((resolve) => {
    stop = onAuthStateChanged(auth, resolve);
  });
  if (stop) stop();
  if (!user) {
    console.error('Ninguém logado neste domínio. Faça login na página e rode de novo.');
    return;
  }

  const snap = await getDoc(doc(getFirestore(app), 'users', user.uid));
  if (!snap.exists()) {
    console.error('Documento users/' + user.uid + ' não existe.');
    return;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    uid: user.uid,
    path: 'users/' + user.uid,
    data: snap.data(),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `study-pets-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);

  console.log('Backup baixado. Chaves salvas:', Object.keys(snap.data()));
})();
