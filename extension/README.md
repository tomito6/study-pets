# Study Pets — a extensão que bloqueia sites

Uma página web não consegue bloquear site nenhum no seu computador. Esta extensão é a
parte que consegue: **enquanto um estudo está rodando no Study Pets**, os sites da sua
lista (Configurações → Geral → **Bloqueio de sites**) mostram o seu pet te esperando em
vez da página, com a contagem do que falta. Na pausa ela libera; no fim do bloco, some
sozinha.

Funciona **com ou sem o modo hardcore** — bloquear site e perder XP são coisas separadas.

Chrome, Edge, Brave e outros Chromium. Manifest V3, sem build: é só apontar a pasta.

## Instalar (3 passos, sem loja)

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. **Carregar sem compactação** → escolha esta pasta (`extension/`).

Pronto. Abra o Study Pets (produção ou `localhost`) e vá em Configurações → Geral →
Bloqueio de sites: deve aparecer **"✓ Extensão encontrada"** com a versão.

> Atualizou os arquivos do app ou da extensão? Clique em **↻** na extensão em
> `chrome://extensions` e recarregue a aba do Study Pets.

## Como saber que está funcionando

Três sinais, do mais rápido ao mais definitivo:

- **"▶ Testar por 1 min"**, em Configurações → Geral → Bloqueio de sites. Publica a sua
  lista por um minuto, sem precisar salvar nem começar um estudo. Abra um dos sites: ele
  cai na tela do pet. É a prova em 5 segundos.
- **A badge "ON"** no ícone da extensão, enquanto o bloqueio está de pé.
- **O popup** (clique no ícone): "Nada bloqueado agora", ou "Bloqueando 3 sites até
  02:55" com a lista e o botão "Abrir Study Pets".

## O que uma linha da lista cobre

Escreva `chess.com` e está bloqueado:

- `chess.com`, `www.chess.com`, `live.chess.com`, `api.chess.com` — **todo subdomínio**;
- qualquer caminho ou porta: `chess.com/play/online`, `chess.com:8080/x`.

Pode colar a URL inteira (`https://www.chess.com/play/online`) — o app guarda só o
domínio. Alguns sites têm um **apelido** que entra junto automaticamente:
`youtube.com` leva `youtu.be`, `twitter.com` e `x.com` levam um ao outro (e `t.co`),
`facebook.com` leva `fb.com` e `fb.watch`, `instagram.com` leva `instagr.am`,
`reddit.com` leva `redd.it`. A lista de apelidos aparece nos chips das Configurações.

Linha que não parece um domínio (`chess`, `lol`) não some em silêncio: aparece marcada
como **"não entendi"** logo abaixo da caixa.

**"Permitir só estes"** inverte: tudo é bloqueado menos a sua lista, o próprio Study Pets
e o login do Google/Firebase (`rules.js`, `ALWAYS_ALLOWED`).

## O que ela NÃO faz

- **Só neste navegador, nesta máquina.** Outro navegador, outro perfil ou o celular não
  são afetados — lá o hardcore ainda cobra XP, mas nada bloqueia.
- **Só página inteira** (`main_frame`): um site que embute um vídeo do YouTube continua
  funcionando; abrir o YouTube, não.
- **Não bloqueia aplicativo** — Spotify, jogo, o que for fora do navegador.
- Firefox suporta Manifest V3 com diferenças (`background.scripts`, permissões); não foi
  testado.

## Por dentro (pra quem for mexer)

- `content.js` roda na página do app: marca o `<html>` com a versão da extensão (é assim
  que o app diz "encontrada"), escuta o evento `study-pets:blocking` que o app dispara
  com o estado em JSON, repassa pro service worker e devolve pra página o **ack**
  (`study-pets:blocking-ack`) com o que foi aplicado. Ao carregar, pergunta o estado
  (`study-pets:blocking?`).
- `background.js` guarda o estado em `chrome.storage.local`, monta as regras (`rules.js`,
  puro, testado em `tests/extension-rules.test.ts` e `tests/extension-background.test.ts`)
  e cria um alarme pro fim do bloco — as regras somem sozinhas mesmo com a aba do app
  fechada. Abas já abertas num site da lista são redirecionadas na hora, e um listener de
  `tabs.onUpdated` pega o que escapa das regras (voltar pelo histórico, prerender).
- **`stopped` x `unknown`**: o app só manda `stopped` quando ele mesmo encerrou (fim do
  bloco, ✕ Parar, desistir, fim do dia, logout). Quando a extensão pergunta e o app não
  tem estudo rodando, a resposta é `unknown` — e a extensão **mantém** o que tinha até o
  alarme vencer. Sem isso, recarregar a página do app seria a porta de escape.
- `blocked.html` é a tela: sprite do pet (os frames vêm do próprio app), o bloco, a
  contagem, e "Voltar pro Study Pets". Não tem botão de desbloquear — a saída é no app.
- `popup.html` é o que o ícone abre.

O teste de ponta a ponta num navegador de verdade (extensão carregada, site de mentira,
regra aplicada) é `npm run test:ext` na raiz do repositório.
