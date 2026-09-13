# Pendências

Lista de coisas pra fazer no app. Diferente do `IDEIAS.md` (rabiscos exploratórios), aqui são tarefas concretas com escopo definido — quando o Tomi disser "faça as pendências", o Claude pega esse arquivo, executa item por item, e remove o que ficou pronto.

**Importante (do Tomi):** qualquer item aqui pode estar incompleto, ambíguo ou ter detalhes não capturados. Quando bater dúvida genuína — decisão visual, escopo, tom — **pergunte antes de executar**. Não invente. Mas também não pergunte o óbvio: se a tarefa tá clara, executa direto.

---

> Uma varredura do repo em 2026-09-08 (branch `chore/pendencias`) fechou o que dava pra fechar sozinho:
> o CLAUDE.md voltou a bater com o código da tela grande, o CSS e os exports mortos do layout anterior
> saíram, o script de backup pelo console voltou a funcionar, as cores do PWA foram pro tema café, e o
> tema e os dois "pedidos" da tela grande ganharam teste. O que sobrou está abaixo: são as pendências
> que **dependem de uma decisão sua** — cada uma com a pergunta e as opções, pra virar tarefa assim que
> você responder.

## 1. As abas do laptop têm outro nome no pacote

O pacote "Café de casa" chamava as abas de "Meu plano · Meus pets · Progresso"; o app usa
"Plano · Análise · Perfil". **Decidir:** adota os nomes do pacote? E se sim, no app inteiro ou só na
barra larga (≥1100px)? Trocar no app inteiro mexe no celular e no smoke test, que clica nas abas pelo
nome; só no laptop custa um `strings.tabsWide` e a mesma tela com dois vocabulários.

## 2. O "chão" do tema café no hero largo do Perfil

No laptop o hero tem ~980px e o chão que o tema café desenha (`.profile-hero-stage::after`, em
`themes/cafe.css`) vira uma linha dura atravessando a largura toda, na altura da cintura dos sprites —
os dois personagens ficam perdidos no meio. No tema escuro não existe chão nenhum, e o habitat do pet
logo abaixo (que nasceu largo) mostra como fica bom. **Decidir:** o palco encolhe e centra, como o
`.room-stage` de 300px da coluna? Ganha cenário como o habitat? Ou some no laptop, como no escuro?
Os hex já viraram tokens `--hero-floor-*`, então é só forma.

## 3. A frase do pet quebra em duas linhas

`strings.plan.room.tagline` = "Boa companhia para o seu próximo passo." Com a coluna em 240 ela quebra.
Cabe em uma linha com ~25 caracteres. **Decidir:** qual frase? (ex.: "Sua companhia de hoje.")

## 4. Janelas do dia: tirar dois botões e ganhar o ritmo

Pedido de 2026-09-07 (IDEIAS.md): tirar "▶ Começar agora" e "↺ Restaurar rotina" do modal, e pôr no
lugar um dropdown pra escolher o ritmo (pomo / pausa curta / pausa longa) ali mesmo.
**Decidir, nesta ordem:** (a) tirando o "Restaurar rotina", como um dia editado volta pra rotina? Hoje
ele é o único caminho — e é também como se desfaz um "Dia livre"; (b) o dropdown edita a config global
ou o override daquele dia passa a carregar ritmo próprio? A segunda opção é a que o IDEIAS chama de
"interessante" (ritmo por janela, ou até por grupo), e ela esbarra na regra "grupo nunca entra no
`generateBlocks`".

**Repetido em 2026-09-12**, com uma saída mais barata junto: o problema real é que o ritmo do pomodoro
mora em Configurações → Estrutura do dia, e ninguém acha. Ou ele sobe pro "🕘 Janelas do dia" (que é o
botão que a pessoa já aperta pra mexer no dia), ou **o tour passa a mostrar onde ele fica**. A segunda
não responde nenhuma das perguntas acima e cabe num balão a mais em `TOUR_STEPS` — **decidir** se
resolve, ou se é só adiar a primeira.

## 5. A Semana no celular

Continua em aberto desde 2026-09-06. Já está descartado: grid de sete colunas rolando de lado. Já foi
rejeitado: uma linha por dia com faixa horizontal das 9h às 19h. **Precisa de uma rodada nova de
esboço** — não dá pra implementar sem ela.

## 6. A validação de evento ainda usa `alert()` nativo

Quatro `alert()` em `features/events/EventPanel.tsx` quando salvar é recusado — é a única caixa nativa
que sobrou no app, e destoa de tudo. **Decidir:** vira toast (como Grupos, Janelas do dia e
Configurações) ou erro inline no painel (como login e apagar conta)? Toast é o padrão dominante pra
recusa de save em modal.

## 7. `stopBlocking()` no logout fura a regra do "recarregar não é escapar"

O bloqueio de sites só manda `stopped` quando *esta* carga da página armou algo — é o que impede
recarregar pra liberar o site. O `stopBlocking()` do logout não tem essa guarda: sair da conta manda
`stopped` mesmo numa aba que nunca armou nada. **Decidir:** aplica a mesma guarda (o bloqueio segue até
o alarme do `until`, no máximo um pomodoro), ou o logout é saída legítima e o texto é que deve dizer
isso?

## 8. Notificação pelo service worker

Hoje é `new Notification`, que no Chrome do Android nem existe como construtor. Trocar por
`registration.showNotification` faz a notificação funcionar no celular — mas só no build (o SW não
existe em dev). O push do servidor o IDEIAS.md já decidiu não fazer. **Decidir:** vale o primeiro
degrau?

## 9. Miúdos de conta, se um dia houver outro usuário

Sem lembrete de e-mail não verificado no perfil, e sem vincular Google + e-mail/senha
(`linkWithCredential`) — quem cria conta com um e-mail que já entrou pelo Google recebe "use o Google".
Ambos foram adiados conscientemente enquanto o app é de um usuário só. **Decidir:** ainda podem esperar?

## 10. Modo tracker, ao lado do modo planner

O app hoje é **planner**: você monta a rotina antes, o dia nasce pronto e você vai marcando. O pedido
(2026-09-12) é o modo **tracker**: você chega, escolhe o ritmo do pomodoro do dia e aperta um botão só
— "Começar". Daí ele emenda pomodoro atrás de pomodoro sozinho, sem plano nenhum, até você dizer que
vai almoçar, que tem um evento, ou parar. O plano vira consequência do que aconteceu, não premissa.

Boa parte já existe: a emenda automática (`chainedBlockAfter`), o foco, a pausa, o check por horário, o
registro de pausas. O que não existe é o chão: hoje **todo** bloco sai de `generateBlocks(config,
eventos, pausas)` e nada de plano é salvo — o histórico é regenerado a cada leitura. Um dia de tracker
não tem rotina que o regenere.

**Decidir, nesta ordem:** (a) é um modo do app inteiro (escolhido no onboarding, trocável nas
Configurações) ou um modo **do dia**, que convive com uma rotina de planner no resto da semana? (b) como
o dia de tracker sobrevive ao reload — uma lista de blocos gravada no doc (a primeira vez que o app
guardaria plano, e mexe em `computeStats`, XP do pet, Análise e aderência), ou um `windowOverride` que
o gerador consiga reproduzir (a janela começa quando você apertou e termina quando você parou)? A
segunda mantém a regra "nada de plano é salvo" e reaproveita tudo, mas precisa de duas janelas pra
representar "parei às 15h e voltei às 17h"; (c) o que a aba Plano mostra durante um dia de tracker: a
lista crescendo bloco a bloco, ou o foco como tela principal?

## 11. O vocabulário (e o nome) presumem estudo

"Janelas de estudo", "Estudo 3", "Encaixar estudo", "meta diária de estudo", `studyWindows`,
`dailyStudyMin` — e "Study Pets". Quem usa pomodoro pra trabalhar não se vê em nada disso, e o pedido
(2026-09-12) é abrir.

**Decidir:** (a) troca só o que o usuário lê e o código mantém `study*` (barato, nenhum schema muda), ou
o vocabulário vai fundo até o documento do Firestore (caro, pede `schemaVersion` novo — e ganha o quê,
já que ninguém lê o doc)? (b) qual palavra: "Estudo" é quente e específica; "Sessão" está ocupada (é a
conta inteira, desde o rename dos ciclos); "Bloco" é o nome interno e é frio. **"Foco"** é o melhor
candidato e já é o nome do overlay; (c) o nome do app muda junto? Aí é domínio, ícone, PWA e os três
documentos legais — e o CLAUDE.md pede pra **não** renomear o projeto na Vercel, porque o domínio muda e
o Authorized domain do Firebase Auth quebra o login com Google. Se mudar, vale plan próprio.

## 12. O modo escuro vira o "Loft noturno"

Pedido de 2026-09-12. O escuro de hoje é o tema original do app, herdado da primeira versão — nunca
foi desenhado. A exploração das oito direções
(`study-pets-cafe-de-casa/referencias/exploracao-8-estilos.html`) tem a **07 · Loft noturno** — "azul
noite, chá verde e âmbar", "a cidade descansa lá fora" — e é essa que deve virar **a versão de estudar
de noite**. Os valores já estão escritos lá, em `#sp-product.sp-loft`: fundo `#1b2632`, painel
`#23313e`, texto `#e4eae6`, apagado `#adbbb9`, linha `#374753`, accent `#a8c9bc`, tinta sobre o accent
`#1e322a`, âmbar `#d4ac83`, raio 16px.

O caminho está aberto: nenhuma cor solta sobrou no CSS (tudo é token no `:root`) e um tema é só
`:root[data-theme=…]` redefinindo tokens — o Café de casa provou isso.

**Decidir:** (a) o loft **substitui** o escuro de hoje, ou entra como um terceiro tema e o herdado
fica? (b) o quarto (`.room-card`, tokens `--room-*`) e o habitat do pet (`[data-habitat="campo"]`)
ganham noite — lua e cidade no lugar de sol e morros? É cor dentro dos tokens que já existem, então
cabe na regra, mas é desenho novo, não redefinição; (c) a exploração também mexia em **geometria**
(timer de 72px, a cena atravessando as duas colunas, a agenda em duas colunas) — e a regra dos temas é
"nunca geometria". Fica só a cor, ou o loft justifica a exceção? (d) entra sozinho pelo horário (de
noite vira loft) ou continua escolha manual em Configurações → Aparência? Automático soa bonito e é
exatamente o tipo de coisa que irrita quando erra.

---

## Como esse arquivo deve crescer

- Adicionar itens numerados com escopo claro — tem que ser executável sem volta pra perguntar.
- Quando virar plan grande (>1h de trabalho), copiar pra `plans/YYYY-MM-DD_HHMM_slug.md` e deixar só uma linha aqui apontando.
- **Remover** o item quando concluído (não deixar histórico — o git tem isso).
- Items abandonados também podem ser removidos. Tudo bem.
