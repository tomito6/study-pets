# Continue o Study Pets a partir daqui

Use este texto junto com o `index.html` deste pacote para continuar o trabalho em outra conversa ou chatbot.

## Contexto e escolhas já feitas

Estamos explorando um novo design para o **Study Pets**, projeto de estudo com Pomodoro e pets. Repositório original: https://github.com/tomito6/study-pets.

O usuário viu oito propostas e gostou especialmente de **Café de casa**. Preserve essa direção: fundo creme, verde sálvia, marrom café, acentos de terracota, títulos em **Lora**, texto e controles em **DM Sans**, superfícies suaves, bastante respiro e uma sensação acolhedora de casa. Preserve os pets em pixel art e o cantinho ilustrado do ambiente. O HTML anexado é a referência visual concreta.

O primeiro feedback foi que faltava um lugar claro para organizar o dia. A versão seguinte colocou o planejamento em destaque, com compromissos, períodos de estudo e intervalos livres visíveis. O usuário gostou dessa evolução.

## Correção mais recente do usuário

> “vc n precisa botar nome pra cada mini sessao. A brisa eh estudo pomdoro.”

Portanto, **não exija que a pessoa invente um título para cada ciclo curto**. O centro da experiência é estudar com Pomodoro. Use rótulos simples ou automáticos, como “Pomodoro 1”, “Pomodoro 2” e “Pausa”. Um assunto ou objetivo pode ser opcional para um período maior de estudo; não precisa ser repetido em cada ciclo.

## Direção para continuar

- Preserve a estética Café de casa e os pets enquanto melhora a clareza das interações.
- Dê um lugar evidente ao plano de hoje: compromissos, janelas livres e períodos reservados para estudar.
- Dentro de um período de estudo, apresente ciclos de foco e pausas com nomes automáticos e uma ação clara para começar ou continuar.
- Faça o planejamento exigir poucas decisões. Mudar um horário ou reservar um intervalo deve ser fácil de entender.
- Mantenha a atividade atual e o temporizador fáceis de encontrar. O ambiente e os pets devem reforçar o aconchego sem esconder a organização do dia.

## O que ainda está em aberto

O usuário ainda não definiu durações obrigatórias, número de ciclos, regras de pausa longa, recorrência, sincronização ou o comportamento final do temporizador. **25 minutos de foco e 5 de pausa são apenas exemplos**, não uma exigência aprovada. A numeração automática é uma interpretação prática da correção; os detalhes do fluxo ainda podem evoluir.

O `index.html` é uma demonstração de design e interação com dados de exemplo. Ele abre sem internet, com fontes, ícones e pets embutidos. As alterações ficam apenas na memória da página e desaparecem ao recarregar. As pausas são planejadas na agenda; **a demonstração ainda não faz a sequência automática foco/pausa**.

O pacote não é um aplicativo completo e não inclui o backend do Study Pets. Não trate seu comportamento como uma especificação fechada ou como implementação de produção. Antes de integrar alterações, confira a versão atual do repositório e a arquitetura real do aplicativo.

## Origem e arquivos de referência

O projeto original foi consultado no commit `e2904b55b450bef707ff086f7dbbfb3f95f151eb`. Os pets vêm do Study Pets; a composição do quarto em CSS é uma proposta criada nesta exploração. A proposta preserva a identidade dos pets, mas suas escolhas de layout, cor e interação são exploratórias.

O pacote inclui a versão atual em `index.html`, uma imagem de referência em `previa-desktop.png`, arquivos editáveis em `cafe-estrutura.html`, `cafe-design.css` e `cafe-interacoes.js`, além de cores e demais tokens em `tokens.json`. A versão anterior fica em `referencias/cafe-planejamento-anterior.html` e as oito propostas iniciais em `referencias/exploracao-8-estilos.html`.

Os recursos visuais e bibliotecas acompanham o pacote em `assets/`; as fontes tipográficas e suas licenças ficam em `fontes/`. `ORIGENS.json` registra URLs de origem e hashes dos recursos. Consulte `LEIA-ME.md` para abrir e compartilhar o conjunto.

**Pedido para o próximo assistente:** leia este contexto, abra a referência visual e continue a evolução do Café de casa, com planejamento do dia claro e estudo Pomodoro sem nome obrigatório para cada mini sessão. Preserve o estilo aprovado ao propor mudanças.
