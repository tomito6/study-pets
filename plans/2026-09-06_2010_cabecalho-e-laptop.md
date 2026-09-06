# Cabeçalho sem emoji, e o app numa tela grande

Branch: `feat/cabecalho-abas` (a partir de `feat/integracao` em 208f7c0). Origem: a conversa de
2026-09-06 à noite. O Tomi pediu "um esboço mais bonito da parte de cima: Plano, Análise e Perfil —
não gostei mais dos emojis, e sinto que deveriam ser maiores ou ter uma letra mais chamativa". No meio
do caminho mandou a foto do app no laptop dele (1920px): a barra de cima vai de borda a borda, o
conteúdo fica numa coluna de 480px no meio, e o resto é vazio. Isso virou a pergunta maior: **como o
app fica numa tela grande?** Este arquivo guarda o estado da discussão; nada abaixo do "Decidido" está
implementado ainda.

Os esboços (HTML autocontido, na paleta e nas fontes do app) estão ao lado deste arquivo:
`2026-09-06_2010_esboco-cabecalho.html` (as quatro direções do cabeçalho) e
`2026-09-06_2010_esboco-laptop.html` (Dia e Semana no laptop, Semana no celular). Abrir no navegador.

## O que está na branch (experimento, não decisão)

- `strings.tabs` sem emoji: "Plano", "Análise", "Perfil".
- O cabeçalho em duas linhas (status em cima: data, XP/nível, Sair; abas embaixo), com **três estilos
  de aba** alternados por um botão flutuante no canto inferior esquerdo (`app/navStyle.ts`,
  `app/NavStyleSwitch.tsx`, guardado em `localStorage`, só do dispositivo): `icons` (ícone em pixel +
  rótulo; o Perfil com o próprio personagem, cinza fora da aba), `underline` (texto 21px com traço
  verde) e `classic` (o de antes, sem emoji — CSS por cima do mesmo markup, com `display:contents`).
- `--topbar-h` no `#app` (88 / 98 / 77px) no lugar do `top:57px` fixo da barra do timer.
- Abaixo de 440px a data vira a forma curta ("qua., 9 de set.") pra caber ao lado do XP.
- Ids e classes das abas não mudaram (`#tab-plano`, `.nav-tab.active`); o e2e continua passando.

## Decidido na conversa

1. **Celular fica como era**, menos os emojis nas abas. O Tomi olhou os três estilos no laptop e
   preferiu o original; a diferença que ele sentia era a barra de borda a borda, não o cabeçalho.
   Quando a implementação começar, o experimento sai: `navStyle.ts`, `NavStyleSwitch.tsx` e o CSS dos
   estilos `icons`/`underline`; fica o `classic` como único (sem `data-nav`).
2. **Largura decide, não o aparelho**: media query a partir de ~1100px. Mesmo código, mesmos
   componentes, só o CSS reposiciona. Tablet deitado e janela estreita caem do lado do celular.
3. **Laptop, modo Dia** (segunda rodada do esboço, a que ele "gostou bastante"): trilho à esquerda
   (data, abas Plano/Análise/Perfil como texto com um traço na ativa, XP com barra, o personagem com o
   pet em cima de uma linha de chão, Configurações e Sair como texto), a lista do dia no centro **sem
   caixa** (linhas separadas por hairline, sessão na cor do horário e num rótulo pequeno, só o bloco de
   agora com fundo, grupo como traço ciano na margem), e à direita o timer (única caixa), o XP pendente
   de hoje e a meta diária com os dots da semana. **Sem** contador de estudos e **sem** sequência (ele
   pediu pra tirar). Duas caixas na tela inteira: o toggle Dia · Semana e o timer.
   A primeira rodada ("Painel", três colunas com doze cards) foi rejeitada: "MUITO poluída". O nível de
   informação estava certo; a embalagem (bordas, fundos, cor em tudo) é que sobrava.
4. **Laptop, modo Semana**: modo de planejar. Sete colunas das 9h às 19h, cada bloco na altura da
   duração, sem borda, blocos como manchas de cor; hoje com tom verde e a linha do agora; feito = verde
   cheio; evento laranja; almoço cinza. Clicar num dia abre o Dia dele. É a única parte que é feature
   nova de verdade (`WeekView` em `features/plan`, lendo `blocksForDay` de cada dia; o toggle é estado
   local do `PlanTab`).
5. **Celular, modo Semana** — em aberto. A proposta (uma linha por dia, faixa horizontal das 9h às
   19h, nome do evento embaixo, horas à direita, toggle ao lado do seletor de semana) ele "não gostou
   super". Próxima rodada precisa de outra ideia; a única coisa descartada de vez é um grid de sete
   colunas rolando de lado.

## Ordem sugerida de implementação

1. Fechar o experimento do cabeçalho: celular = original sem emoji; tirar o botão e os dois estilos.
2. A lista sem caixa (CSS das `.block-row`) — decisão pendente: só no laptop, ou no celular também.
3. O grid de três colunas do Dia a partir de 1100px (trilho, lista, coluna da direita), reaproveitando
   `Header`, `TimerBar`, o XP pendente e os dots da Análise.
4. A Semana no laptop.
5. A Semana no celular, depois de uma nova rodada de esboço.

## Nota de processo

Enquanto esta branch nascia, outra sessão editava o **mesmo checkout** (o que virou 208f7c0). Os dois
commits daqui foram montados por plumbing (`GIT_INDEX_FILE` + `commit-tree`) só com os hunks deste
trabalho, e depois rebaseados em cima de 208f7c0. Ver a memória "outra-sessao-no-mesmo-checkout".
