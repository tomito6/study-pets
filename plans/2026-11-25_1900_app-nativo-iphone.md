# App nativo de iPhone — a casca (Capacitor)

2026-11-25. Pedido do Tomi: "começar a fazer um app local, algo que depois seria facilmente
deployable como app pro iPhone".

## A decisão

**Capacitor**: o app web que já existe (React + TypeScript + Vite, o mesmo domínio, os mesmos
testes) roda dentro de um projeto de iPhone de verdade, que abre no Xcode e vai pra App Store.
Uma base de código só; o site na Vercel não muda.

Descartados:

- **React Native / Expo** — reescrever a interface inteira (158 KB de CSS, dois temas, o layout
  B7, a suíte e2e de 78 casos). Meses pra chegar no mesmo lugar, e duas UIs pra manter depois.
- **Só o PWA** — já existe ("Adicionar à Tela de Início" funciona hoje, de graça). O que ele não
  faz é o que está no IDEIAS.md desde setembro: **avisar o fim do bloco com o celular travado**.
  Página web não agenda aviso; app nativo agenda uma notificação local no sistema, sem servidor.
  Esse é o ganho real do app nativo, mais a presença na App Store no dia de abrir pra outros.

## O que entrou neste passo

Só a casca, e nada que mude o site:

- `capacitor.config.ts`, `@capacitor/core`/`ios`/`cli` (8.x) e o projeto `ios/` gerado e
  versionado. Dependências nativas por **Swift Package Manager** — sem CocoaPods.
- `npm run build:native` → `dist-native/`, o mesmo app **sem service worker**. `npm run ios:sync`
  builda e copia pro projeto iOS; `npm run ios:open` abre no Xcode.
- `infrastructure/platform.ts` (`isNativeApp()`) e `application/platform.ts` (`legalUrl`).
- Firebase Auth nasce por `initializeAuth` dentro do app (o `getAuth` trava o WebView do iOS).
- Tela de login: dentro do app o botão do Google dá lugar a uma frase. E-mail e senha funcionam.
- Documentos legais: dentro do app os links apontam pro site publicado (abrem no Safari).
- Ícone 1024 sem alfa e tela de abertura, do mesmo `scripts/app-icon.mjs` dos ícones do PWA.
- iPhone só em pé (como o manifest do PWA); iPad gira, e deitado cai no layout de tela grande.

## Como rodar (num Mac)

```
npm install
npm run ios:sync
npm run ios:open        # no Xcode: escolher um simulador ou o aparelho e ▶
```

No simulador não precisa de conta nenhuma. No aparelho, o Xcode pede um "Team": com um Apple ID
gratuito o app instalado vale 7 dias; com a conta de desenvolvedor (US$ 99/ano) vale um ano e
abre o TestFlight.

**Sem Mac**: o projeto não compila no Windows. As saídas são um Mac na nuvem — Codemagic,
GitHub Actions com runner macOS, Ionic Appflow — que builda e sobe pro TestFlight, e aí a conta
paga da Apple é obrigatória. Nada disso foi configurado.

## O que NINGUÉM conferiu ainda

Este passo foi feito num Linux. O build nativo foi aberto num Chromium fingindo ser o app (a
tela de login certa, sem service worker, sem erro), e os testes cobrem as costuras. **Nada rodou
num iPhone nem num simulador, e o projeto do Xcode não foi compilado.** A lista do que só o
aparelho prova:

1. **Área segura.** `ios.contentInset: 'always'` deve manter a página abaixo do relógio e acima
   da barra de gesto sem o CSS saber disso. Conferir a barra do topo (sticky), o foco e as
   Configurações (`position:fixed; inset:0`) e os modais. Se sobrar ou faltar, a alternativa é
   `viewport-fit=cover` + `env(safe-area-inset-*)` nesses elementos.
2. **A cor das faixas da área segura** é o creme do Café de casa (`backgroundColor`). No Loft
   noturno fica creme em cima de app escuro — pede o plugin StatusBar acompanhando o tema.
3. **Login por e-mail/senha a partir de `capacitor://localhost`.** Deve funcionar; se a chave de
   API do Firebase tiver restrição de "HTTP referrer" no console do Google Cloud, não funciona,
   e a restrição tem de ganhar a origem do app (ou virar restrição por bundle id).
4. **Firestore com cache em IndexedDB** dentro do WKWebView (deve funcionar; é o mesmo Safari).
5. **"Baixar (JSON)"** — `Blob` + `<a download>` não costuma baixar nada num WKWebView. Se
   confirmar, precisa dos plugins Filesystem + Share (a folha de compartilhar do iOS). É o
   direito de portabilidade: não pode ficar quebrado numa versão publicada.
6. **Som** (o `AudioContext` nasce num gesto — a regra é a mesma do Safari) e **Wake Lock** no
   foco (o WKWebView pode não ter a API; aí o plugin KeepAwake).
7. **Teclado** cobrindo campo (login, nota do bloco, nome do pet) e os `<input type="time">`.
8. **Bloqueio de sites**: a seção das Configurações fala de extensão de navegador. No iPhone
   não existe; a seção deveria sumir dentro do app.

## Os próximos passos, na ordem que eu faria

**1. Rodar num aparelho** e passar a lista acima. Depende de Mac ou de build na nuvem.

**2. O alarme com a tela travada** — o motivo de o app nativo existir. A peça já está pronta do
lado do app: `application/timerAlarm.ts` é uma projeção do timer ("avise às 10:25 com este
título") feita pra extensão do navegador. O app nativo é mais um ouvinte dela: plugin
`@capacitor/local-notifications`, agendar no `running: true`, cancelar no `running: false`.
Decisão a tomar com o aparelho na mão: com o app em frente, quem toca — o som do app (o arpejo
"deu certo") ou a notificação do sistema? Nunca os dois.

**3. Login com Google e "Entrar com a Apple".** Popup não existe dentro de app; o Google entra
por plugin nativo, que devolve um token pro `signInWithCredential` do Firebase. Precisa de um
app iOS registrado no console do Firebase com o bundle id (gera o `GoogleService-Info.plist`).
E a App Store exige (diretriz 4.8) "Entrar com a Apple" de quem oferece login com Google.
Até lá, pra entrar no app com uma conta que nasceu pelo Google: "Esqueci a senha" na tela de
login cria uma senha pra mesma conta (comportamento do Firebase; **a conferir** antes de contar
com isso). Atenção ao `AuthUser.provider`, que é singular — a pendência 2 do PENDENCIAS.md.

**4. App Store.** O nome do app (pendência 4: "Pomodoro" é marca de terceiro — "Study Pets" não
tem o problema), os rótulos de privacidade, a política de privacidade mencionando o app, uma
conta de teste pro revisor, e a diretriz 4.2: site embrulhado sem nada de nativo é recusado. O
alarme do passo 2 é o que responde a ela. Apagar a conta de dentro do app (5.1.1) já existe.

## Decisões que são do Tomi

- **O identificador do app** (`appId`): hoje `app.studypets`, provisório. Ninguém vê, mas depois
  da primeira subida pro TestFlight não muda mais. Trocar = `capacitor.config.ts` e as duas
  linhas `PRODUCT_BUNDLE_IDENTIFIER` do projeto (`tests/native-app.test.ts` cobra que batam).
- **Mac emprestado, Mac na nuvem, ou esperar.**
- **Pagar a conta de desenvolvedor** (US$ 99/ano) — só faz sentido quando o passo 2 existir.
- **Android junto?** O Capacitor gera o projeto Android do mesmo jeito, e esse compila no
  Windows (Android Studio). Serviria pra ver a casca nativa rodando sem Mac nenhum.
