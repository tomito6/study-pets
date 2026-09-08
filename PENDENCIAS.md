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

---

## Como esse arquivo deve crescer

- Adicionar itens numerados com escopo claro — tem que ser executável sem volta pra perguntar.
- Quando virar plan grande (>1h de trabalho), copiar pra `plans/YYYY-MM-DD_HHMM_slug.md` e deixar só uma linha aqui apontando.
- **Remover** o item quando concluído (não deixar histórico — o git tem isso).
- Items abandonados também podem ser removidos. Tudo bem.
