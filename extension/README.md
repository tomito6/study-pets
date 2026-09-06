# Extensão do modo hardcore

Uma página web não bloqueia site nenhum no seu computador. Esta extensão é a parte que
consegue: enquanto um **estudo** hardcore roda no Study Pets, os sites da sua lista
(Configurações → Geral → Modo hardcore) mostram o seu pet te esperando em vez da página,
com a contagem do que falta. Na pausa, e fora do hardcore, ela não faz nada.

Chromium (Chrome, Edge, Brave). Manifest V3, `declarativeNetRequest`, sem build.

## Instalar (sem loja)

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. **Carregar sem compactação** → escolha esta pasta (`extension/`).
4. Abra o Study Pets (produção ou `localhost`) e vá em Configurações → Geral → Modo hardcore:
   deve aparecer "✓ Extensão do navegador encontrada".

Atualizou os arquivos? Clique em ↻ na extensão em `chrome://extensions`.

## Como funciona

- `content.js` roda na página do app: marca o `<html>` (é assim que o app sabe que a extensão
  existe), escuta o evento `study-pets:hardcore` que o app dispara com o estado em JSON, e
  repassa pro service worker. Ao carregar, pergunta o estado (`study-pets:hardcore?`).
- `background.js` guarda o estado em `chrome.storage.local`, monta as regras (`rules.js`, puro,
  testado em `tests/extension-rules.test.ts`) e cria um alarme pro fim do bloco — as regras
  somem sozinhas mesmo com a aba do app fechada. Abas já abertas num site da lista são
  redirecionadas na hora.
- `blocked.html` é a tela: sprite do pet (os frames vêm do próprio app), nome, o bloco, a
  contagem, e "Voltar pro Study Pets". Não tem "desbloquear": a saída é desistir lá no app.

Só navegação de página inteira é redirecionada (`main_frame`) — um site que embute um vídeo do
YouTube continua funcionando; abrir o YouTube, não. "Permitir só estes" bloqueia tudo o mais,
menos o próprio app e o login do Google/Firebase (`rules.js`, `ALWAYS_ALLOWED`).

## Limites

- Só neste navegador, nesta máquina. Celular não tem extensão: lá o hardcore cobra XP, mas
  não bloqueia site.
- Firefox suporta Manifest V3 com diferenças (`background.scripts`, permissões); não foi testado.
- Um vídeo que já estava tocando numa aba aberta é redirecionado quando o bloco começa, mas
  áudio de outra aplicação (Spotify desktop) não é da alçada do navegador.
