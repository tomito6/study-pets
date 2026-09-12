# Study Pets · Café de casa

Pacote para guardar o design e continuar o trabalho em outra conversa, com outro chatbot ou em um editor.

## Como usar

1. Abra `index.html` no navegador para ver e experimentar a proposta atual. Ele abre **sem internet**: fontes, ícones e pets estão embutidos no próprio arquivo.
2. Em outra conversa, anexe esse HTML e `CONTINUE-AQUI.md`. O primeiro preserva o visual e as interações; o segundo preserva as escolhas e o último feedback.
3. Para trabalhar nos arquivos separados, compartilhe o pacote inteiro. Se o chatbot não conseguir executar HTML, envie `previa-desktop.png` junto com o contexto. A imagem registra a aparência; o HTML preserva também as interações.

O HTML atual é a referência principal. As versões em `referencias/` ajudam a comparar a evolução; a correção sobre Pomodoro sem títulos obrigatórios está registrada em `CONTINUE-AQUI.md`.

## Conteúdo

| Arquivo ou pasta | Para que serve |
| --- | --- |
| `index.html` | Protótipo portátil atual, com nomes genéricos para os blocos de Pomodoro. |
| `CONTINUE-AQUI.md` | Contexto pronto para levar a outro assistente. |
| `cafe-estrutura.html` | Estrutura da interface separada para edição; use `index.html` para abrir a demonstração completa. |
| `cafe-design.css` | Estilos em um arquivo editável. |
| `cafe-interacoes.js` | Interações em um arquivo editável. |
| `tokens.json` | Valores de referência do sistema visual. |
| `previa-desktop.png` | Imagem da proposta atual para referência rápida e conversas que não abrem HTML. |
| `referencias/cafe-planejamento-anterior.html` | Arquivo preservado da proposta anterior de planejamento. |
| `referencias/exploracao-8-estilos.html` | Exploração original das oito direções de design. |
| `assets/` | Imagens dos pets e personagem, bibliotecas de ícones e apoio, com suas licenças. |
| `fontes/` | Fontes tipográficas, estilos para incorporá-las e licenças. |
| `ORIGENS.json` | URLs de origem e hashes dos recursos incluídos. |

As fontes editáveis acompanham a exportação atual. Ao alterá-las, atualize também o HTML portátil para manter as duas formas de distribuição consistentes.

## Direção preservada

Creme, sálvia, café e terracota; títulos em Lora e texto em DM Sans; ambiente acolhedor com pets em pixel art. O planejamento do dia deve ficar evidente. Os ciclos de estudo devem funcionar sem exigir um nome individual para cada mini sessão.

## Origem e limites do protótipo

Projeto original: [tomito6/study-pets](https://github.com/tomito6/study-pets), consultado no commit `e2904b55b450bef707ff086f7dbbfb3f95f151eb`. Os pets têm origem nesse projeto. O quarto montado em CSS e a direção Café de casa são uma proposta desta exploração.

Os horários, compromissos e ciclos exibidos são exemplos. As alterações ficam **apenas na memória da página e desaparecem ao recarregar**. As pausas podem ser planejadas na agenda; a demonstração ainda não alterna automaticamente entre foco e pausa.

Este pacote é um protótipo visual interativo, não um aplicativo completo, e não fornece o backend do Study Pets. Antes de levar a proposta para o aplicativo, confira o repositório atual e conecte o fluxo aos dados e às regras reais do projeto.
