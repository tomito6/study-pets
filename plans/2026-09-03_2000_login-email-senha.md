# Conta com e-mail e senha, além do Google

Branch: `feat/login-email`. Origem: IDEIAS.md, "Conta com e-mail e senha, além do Google — 2026-09-03".
Rodou como tarefa agendada (madrugada de 2026-09-03/04), sem o Tomi presente pra tirar dúvidas — as
decisões abaixo foram tomadas sozinhas, seguindo o rabisco do IDEIAS.md e o padrão do resto do código.

## O que foi feito

1. **`src/domain/auth.ts`** (novo, com teste): `isValidEmail` (regex simples), `isValidPassword`
   (mínimo 8 — o Firebase aceita 6), `AuthError` (motivo tipado: `email-in-use`, `invalid-credential`,
   `weak-password`, `invalid-email`, `too-many-requests`, `network`, `unknown`) e
   `authErrorReasonFromCode`, que traduz os códigos do Firebase Auth pro motivo — juntando de propósito
   `auth/wrong-password`/`auth/user-not-found` (SDKs antigos) e `auth/invalid-credential` (SDKs novos)
   no mesmo motivo, pra nunca revelar se foi o e-mail ou a senha que errou.
2. **`AuthPort`** (`src/infrastructure/ports.ts`) ganhou `signUpWithEmail`, `signInWithEmail`,
   `sendPasswordReset`, e `deleteCurrentUser` passou a aceitar `password` nas opções. `AuthUser` ganhou
   `provider?: 'google' | 'password'` (opcional — ausente é tratado como `'google'`).
3. **Firebase** (`src/infrastructure/firebase/auth.ts`): implementa os três métodos novos mapeando os
   códigos de erro do jeito descrito acima; `signUpWithEmail` já dispara `sendEmailVerification` (sem
   bloquear a criação — erro aí é só logado). `deleteCurrentUser` decide a reautenticação pelo
   `providerData` do usuário: popup do Google, ou `reauthenticateWithCredential` com
   `EmailAuthProvider.credential(email, senha)` quando o provedor é `password`.
4. **Memória** (`src/infrastructure/memory/auth.ts`): registro de contas por e-mail dentro do próprio
   módulo (um `Map`, fechado no `createMemoryAuth()`) — criar duas vezes o mesmo e-mail dá
   `email-in-use`, senha errada dá `invalid-credential`, reset "envia" e resolve sem fazer nada. Uid
   deriva do e-mail (`email:<endereço em minúsculas>`), então cada conta vira um documento separado no
   repositório em memória. O usuário fixo (`TEST_USER`) continua igual, com `provider: 'google'`.
5. **`src/application/session.ts`**: `signUpWithEmail`/`signInWithEmail`/`resetPassword`, todos
   devolvendo `{ok:true} | {ok:false, reason}` — o mesmo padrão de `saveSettings`. Validam formato de
   e-mail e tamanho de senha **antes** de chamar a porta (não adianta perguntar pro Firebase se já sei
   que a senha é curta). `resetPassword` sempre devolve `ok:true` quando o e-mail tem formato válido,
   mesmo que a conta não exista.
6. **`src/application/account.ts`**: `deleteAccount` ganhou um segundo parâmetro opcional `password`,
   repassado pra `auth.deleteCurrentUser`.
7. **`src/features/auth/LoginScreen.tsx`**: formulário curto (e-mail, senha) acima do botão do Google,
   separados por um "ou". Ids: `#login-email`, `#login-password`, `#login-submit`,
   `#login-toggle-mode` (o link que alterna Entrar/Criar conta), `#login-forgot`, `#login-error`,
   `#login-reset-sent`. Enter envia (é um `<form>`). O botão do Google manteve `.ls-google-btn` e o
   comportamento — o teste 2 do smoke não precisou mudar.
8. **`src/features/settings/DangerModals.tsx`**: o modal de apagar conta mostra um campo de senha
   (`#del-acc-password`) só quando `state.user.provider === 'password'`, obrigatório pra destravar o
   botão junto com o "APAGAR".
9. **`src/shared/strings.ts`**: textos novos em `login` (campos, botões, links, mensagens de erro por
   motivo) e em `settings.deleteAccount` (rótulo/placeholder da senha; a mensagem de `reauth` deixou de
   falar só de Google — "Confirmando sua identidade pra finalizar...").
10. **CSS** (`src/styles/login.css`): `.ls-form`, `.ls-input`, `.ls-error`, `.ls-info`,
    `.ls-submit-btn`, `.ls-links`, `.ls-link`, `.ls-divider` — no mesmo tema escuro/verde-lima do resto
    da tela de login.
11. **Testes**: `tests/auth.test.ts` (domínio), `tests/memory-infra.test.ts` ganhou um describe novo
    (`auth em memória — e-mail e senha`), `tests/application-auth.test.ts` (novo — os casos de uso).
    E2E novos no `e2e/smoke.spec.ts`: 21 (criar conta por e-mail abre com onboarding), 22 (senha errada
    → erro inline, senha certa → entra), 23 (esqueci a senha → confirmação inline). Extraí
    `passarOnboarding(page)` de dentro do `abrirApp` pra reusar nesses testes.

## Decisões tomadas sozinho (autorizadas pelo prompt da tarefa — "na dúvida, escolha e documente")

- **E-mail já em uso não vincula os provedores.** Segui a instrução explícita: mostrar
  "Já existe uma conta com este e-mail. Entre com o Google ou use 'Esqueci a senha'." em vez de
  `linkWithCredential`. **Alternativa, se o Tomi quiser depois:** implementar o link é mais trabalho
  (precisa capturar a credencial pendente do erro `auth/account-exists-with-different-credential` — que
  só aparece com "One account per email" habilitado — e completar o link após reautenticar), mas
  resolve de vez a fricção de "esqueci com qual entrei". Trocar em `src/domain/auth.ts` (motivo
  `email-in-use`) e no fluxo de sign-up.
- **Verificação de e-mail sem lembrete no perfil.** `sendEmailVerification` dispara ao criar a conta
  (item obrigatório do prompt), mas o "lembrete discreto no perfil quando `emailVerified` for falso"
  ficou de fora — exigiria expor `emailVerified` em `AuthUser`, guardar/atualizar esse estado, e uma UI
  nova no `ProfileTab`. O prompt permitia pular ("se for fácil... senão pule"), e o ganho é pequeno
  (ninguém trava por causa disso). **Pra fazer depois:** adicionar `emailVerified?: boolean` em
  `AuthUser`, popular no `toAuthUser` do Firebase, e um banner condicional no `ProfileTab.tsx`.
- **Mensagem de erro na reautenticação por senha não é específica.** Se o Tomi digitar a senha errada
  no modal de apagar conta, o status cai no mesmo `reauth-failed` genérico que already existe pro
  Google ("Seus dados foram apagados, mas a conta continua..."). Não criei uma mensagem "senha
  incorreta" separada porque o `deleteCurrentUser` só devolve `DeleteAccountError('reauth', causa)`, sem
  motivo tipado — abrir isso exigiria propagar `AuthErrorReason` através de `DeleteAccountError`.
  **Pra fazer depois:** dar um `reason?: AuthErrorReason` pro `DeleteAccountError` e mapear em
  `account.ts`/`DangerModals.tsx`.
- **Registro de contas por e-mail no modo teste não sobrevive a reload.** Fica num `Map` dentro do
  módulo (memória do processo), não no `sessionStorage` — diferente do documento do usuário, que
  sobrevive. Não achei nenhum fluxo que precisasse disso (nem os e2e pedem), e o próprio estado de
  login/logout do `TEST_USER` já não sobrevive a reload hoje (só o *documento* sobrevive). Manter
  consistente com esse comportamento existente pareceu mais certo que inventar uma persistência nova
  só pra isso. **Pra fazer depois, se incomodar:** guardar o registro também em `sessionStorage`
  (`study-pets:teste:contas`), com o mesmo padrão do `userRepository.ts`.
- **Sem validação de senha "forte" além do tamanho.** O prompt só pediu mínimo de 8 caracteres, sem
  exigir maiúscula/número/símbolo. Mantive assim — mais regra de senha é fricção sem ganho de segurança
  real pra esse tipo de app, e não foi pedido.
- **Nenhuma mudança no schema do Firestore.** Autenticação não é dado do documento do usuário (fica no
  Firebase Auth, fora de `users/{uid}`), então não precisou de `hydrateUserDoc`/`serializeState` nem
  `schemaVersion` novo.

## O que ficou de fora (e por quê)

- **Lembrete de e-mail não verificado no perfil** — ver decisão acima.
- **Vincular contas Google + e-mail (`linkWithCredential`)** — ver decisão acima.
- **Distinguir "senha incorreta" de outros motivos na reautenticação do apagar conta** — ver decisão
  acima.
- **Tradução/i18n** — todo texto novo foi direto pro português em `strings.ts`, seguindo o padrão do
  resto do app (i18n é ideia futura documentada no IDEIAS.md, não escopo desta tarefa).

## O que o Tomi precisa fazer fora do código (Firebase Console) antes de mergear

1. **Authentication → Sign-in method → ativar "Email/Password"** (a opção simples — **não** ativar
   "Email link (passwordless sign-in)", que é outro fluxo).
2. **Authentication → Templates → idioma do e-mail de redefinição de senha para português (Brasil)** —
   por padrão o Firebase manda em inglês.
3. **Conferir "Email enumeration protection"** em Authentication → Settings — em projetos novos já vem
   ligada, o que faz `auth/invalid-credential` cobrir tanto senha errada quanto e-mail inexistente (o
   código já trata os dois iguais, então funciona ligada ou desligada). Se estiver **desligada**, o
   Firebase vai devolver `auth/user-not-found` pra e-mail inexistente e `auth/wrong-password` pra senha
   errada — o mapeamento em `domain/auth.ts` já cobre os dois códigos com o mesmo motivo
   (`invalid-credential`), então a UI continua sem revelar qual foi. Não precisa mudar nada, só
   confirmar que está do jeito que o Tomi preferir.
4. Sem mudança nenhuma nas regras do Firestore (`firestore.rules`) — elas já são por
   `request.auth.uid`, que existe igual pra conta Google ou e-mail/senha.

## Verificação

- `npm run typecheck` — limpo.
- `npm test` — 369 testes (346 antes + 23 novos: 6 domínio, 8 infra em memória, 9 aplicação).
- `npm run test:e2e` (`PW_PORT=5176 CI=1 npx playwright test`) — 22 testes, todos passando (23 nomes,
  o "6 e 7" conta como um). Rodei a suíte inteira mais de uma vez pra garantir que o teste 22 não é
  flaky (achei e corrigi uma race: o onboarding da conta nova bloqueava o clique em "Sair" antes de eu
  completar o onboarding no teste; e o save com debounce podia não ter chegado no `sessionStorage`
  antes do próximo login, fazendo a conta parecer "nova" nele — mesma pegadinha que o teste 15 já
  documentava).
- `npm run build` — gera `dist/` sem erros.
- Testado manualmente no browser (modo teste, `vite --mode teste`): criar conta, alternar
  Entrar/Criar conta, senha curta mostra "A senha precisa ter pelo menos 8 caracteres." inline — achei
  esse bug (a checagem de tamanho só existia no domínio, não estava conectada no `signUpWithEmail`) e
  corrigi antes de fechar a tarefa.

## MANUAL DE TESTE (modo teste, sem Firebase)

Rodar `npm run dev:teste` (porta 5174) ou, se estiver ocupada, `npx vite --mode teste --port <porta>`.

1. **Criar conta por e-mail nova.** Abra o app (já entra logado no usuário de teste, com onboarding
   aberto). Complete o onboarding normal (escolha um pet, "Continuar", "Começar"). Clique em **Sair**
   no cabeçalho — volta pra tela de login, com o formulário de e-mail/senha acima do botão do Google.
   Clique em **Criar conta** (o link abaixo do botão): o botão principal muda pra "Criar conta" e o
   link vira "Já tenho conta". Digite um e-mail (ex.: `voce@teste.com`) e uma senha de 8+ caracteres
   (ex.: `senha1234`). Clique em "Criar conta" — o app abre de novo, com o onboarding aparecendo (é
   conta nova).
2. **Senha curta é recusada antes de chamar qualquer coisa.** Ainda em "Criar conta", tente uma senha
   de menos de 8 caracteres — deve aparecer "A senha precisa ter pelo menos 8 caracteres." embaixo do
   formulário, sem sair da tela.
3. **E-mail repetido.** Saia de novo, tente criar outra conta com o mesmo e-mail do passo 1 — deve
   aparecer "Já existe uma conta com este e-mail. Entre com o Google ou use 'Esqueci a senha'.".
4. **Entrar com senha errada, depois certa.** Ainda na tela de login (modo "Entrar", que é o padrão),
   digite o e-mail do passo 1 com uma senha errada — aparece "E-mail ou senha incorretos." embaixo do
   formulário. Corrija a senha e envie de novo — o app abre, e o onboarding **não** aparece (a conta já
   passou por ele no passo 1).
5. **Esqueci a senha.** Na tela de login, digite qualquer e-mail (existente ou não) e clique em
   "Esqueci a senha" — aparece "Enviamos um e-mail pra `<email>`." Não existe e-mail de verdade no modo
   teste; é só a confirmação visual.
6. **Google continua igual.** Saia, clique direto no botão "Continuar com Google" (sem mexer no
   formulário) — entra no usuário fixo de teste, como sempre funcionou.
7. **Apagar conta com senha.** Crie uma conta por e-mail (ou reuse uma), vá em ⚙️ Configurações → Geral
   → Apagar conta. O modal deve mostrar um campo de senha **antes** do campo "Digite APAGAR" (isso não
   aparece pra quem entrou com Google). Preencha os dois e confirme — a conta é apagada e volta pra
   tela de login. (No modo teste a senha não é checada de verdade — é só o campo aparecendo/obrigando
   preenchimento; a checagem real só acontece contra o Firebase.)

Pra testar contra o Firebase de verdade (`npm run dev`), primeiro ativar "Email/Password" no console
(passo 1 da seção acima) — sem isso, criar conta por e-mail vai falhar com erro de configuração.
