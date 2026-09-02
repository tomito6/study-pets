/* Study Pets — backup do seu documento do Firestore, sem instalar nada.
 *
 * COMO USAR
 *   1. Abra https://plano-estudos-one.vercel.app e faça login normalmente.
 *   2. Abra o DevTools (F12) → aba Console.
 *   3. Cole este arquivo inteiro e dê Enter.
 *   4. Um arquivo study-pets-backup-AAAA-MM-DD.json é baixado.
 *
 * Reutiliza o app Firebase que a página já inicializou (mesma URL de SDK,
 * mesma instância de módulo), então não pede login de novo nem cria conexão nova.
 *
 * Rode isto ANTES de qualquer mudança de schema. É o seu rollback.
 */
(async () => {
  const V = 'https://www.gstatic.com/firebasejs/10.12.0';
  const { getApps, getApp } = await import(`${V}/firebase-app.js`);
  const { getAuth } = await import(`${V}/firebase-auth.js`);
  const { getFirestore, doc, getDoc } = await import(`${V}/firebase-firestore.js`);

  if (!getApps().length) {
    console.error('Firebase não inicializado nesta página. Você está em plano-estudos-one.vercel.app e logado?');
    return;
  }

  const app = getApp();
  const user = getAuth(app).currentUser;
  if (!user) {
    console.error('Ninguém logado. Faça login na página e rode de novo.');
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
