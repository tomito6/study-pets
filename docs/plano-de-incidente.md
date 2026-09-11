# Plano de incidente

> **Para quando você estiver com medo e com pressa.** Este documento existe porque o art. 33
> do GDPR dá **72 horas** para notificar a autoridade, contadas de quando você toma
> conhecimento — e ninguém escreve um plano decente dentro dessas 72 horas. Escrito com
> calma, ele vira uma checklist. Escrito em pânico, vira nada.
>
> Interno. Não vai pro ar. Companheiro do [registro de tratamento](registro-tratamento.md).

Versão de 11 de setembro de 2026

---

## Antes de tudo: os contatos

| | |
|---|---|
| Você | Tomás Spielmann — **[preencher: e-mail de contato do projeto]** |
| Autoridade (Alemanha) | *Bayerisches Landesamt für Datenschutzaufsicht* (BayLDA), Ansbach. Tem formulário próprio de notificação no site. |
| Autoridade (Brasil) | ANPD — comunicação de incidente pelo canal do gov.br |
| Console do Firebase | Projeto `plano-estudos-bf51d` |
| Hospedagem | Vercel, projeto `plano-estudos` |

## O que conta como incidente

Não é só invasão. O art. 4(12) do GDPR fala em destruição, perda, alteração, divulgação ou
acesso não autorizado — **acidental também conta**. Os casos realistas para este app,
do mais provável ao menos:

1. **Regras do Firestore publicadas erradas.** Um deploy de `firestore.rules` que libere
   leitura ampla expõe todos os documentos. É o cenário mais provável de todos, porque
   depende de um comando só.
2. **Dado de um titular gravado no documento de outro.** Foi um bug real, corrigido em
   11/09/2026. Se voltar, é incidente de confidencialidade, não bug.
3. **Perda de dado.** Um save gravando estado vazio por cima do histórico. Também foi bug
   real, corrigido. Sem backup, a perda é definitiva — e perda é incidente.
4. **Conta do Google comprometida.** A que administra o Firebase. Dá acesso a tudo.
5. **Vazamento por terceiro.** Um incidente no Google ou na Vercel. Eles avisam; a obrigação
   de notificar os titulares continua sendo sua.
6. **Dispositivo perdido ou emprestado** com a sessão aberta e o cache local do Firestore.

## A primeira hora

**Pare o sangramento antes de escrever qualquer coisa.**

1. **Anote a hora exata em que você soube.** É dela que correm as 72 horas. Escreva num
   arquivo, não na memória.
2. **Feche o buraco.**
   - Regras erradas → publique `firestore.rules` corrigido **agora**: `firebase deploy --only firestore:rules`. Confirme no console que a versão ativa é a certa.
   - Conta comprometida → troque a senha do Google, revogue as sessões, confira 2FA, e veja os registros de acesso do console.
   - Bug do app → tire a versão do ar (rollback do deploy na Vercel é imediato) antes de investigar.
3. **Preserve a evidência.** Antes de consertar mais nada: baixe/copie os registros do
   Firebase (Cloud Logging) e o histórico de deploy da Vercel. Eles somem ou rotacionam.
4. **Não apague nada** para "limpar". Apagar evidência piora tudo, inclusive juridicamente.

## As três perguntas que decidem o resto

1. **Que dados, de quantas pessoas, e por quanto tempo ficaram expostos?**
2. **Alguém de fora chegou a acessar, ou só era possível acessar?** A diferença muda o risco,
   mas *não* dispensa a notificação — a exposição já é a violação.
3. **Há dado que possa causar dano real?** Aqui, o que pesa é o nome de compromissos
   importados (pode revelar saúde) e a lista de sites bloqueados (revela interesse).

## Notificar a autoridade — 72 horas

**Notifique se houver qualquer risco aos direitos dos titulares.** Só está dispensado quando
o risco é *improvável* (art. 33(1)) — e essa avaliação precisa estar escrita, com o
raciocínio, mesmo que você conclua que não precisa notificar. A dúvida resolve-se
notificando: notificação a mais não gera multa, ausência de notificação gera.

Se as 72 horas estourarem, notifique mesmo assim, com a justificativa do atraso.

O art. 33(3) manda dizer, no mínimo:

- a natureza da violação, as categorias e o número aproximado de titulares e de registros;
- o contato de quem responde (você);
- as consequências prováveis;
- as medidas tomadas ou propostas, inclusive as de mitigação.

> **Modelo, para ajustar na hora**
>
> Comunico, na qualidade de responsável pelo tratamento, uma violação de dados pessoais
> ocorrida no serviço Study Pets (`plano-estudos-one.vercel.app`).
>
> **Quando**: ocorrida em `[data/hora]`, conhecida por mim em `[data/hora]`.
> **O que aconteceu**: `[descrição factual, sem adjetivo]`.
> **Dados atingidos**: `[categorias do item 4 do registro de tratamento]`.
> **Titulares atingidos**: aproximadamente `[N]`.
> **Consequências prováveis**: `[avaliação honesta]`.
> **Medidas já tomadas**: `[o que foi feito, com horário]`.
> **Medidas propostas**: `[o que ainda será feito]`.
> **Contato**: `[e-mail]`.

## Avisar os usuários — quando o risco é alto

O art. 34 obriga a comunicar os próprios titulares quando o risco for **alto**, e
"sem demora injustificada" — o que na prática costuma ser antes das 72 horas da autoridade.
A dispensa vale se os dados eram ininteligíveis (criptografados com chave não atingida) ou se
você tomou medidas que afastaram o risco alto.

Escreva em português comum: o que aconteceu, que dados eram, o que a pessoa deve fazer, e o
que você já fez. Sem minimizar e sem jargão. O e-mail sai para o endereço da conta.

No Brasil, o art. 48 da LGPD manda comunicar ANPD **e** titular em prazo razoável.

## Depois

- Escreva o que deu errado e por quê, e **acrescente o teste que teria pegado**. Os dois bugs
  citados acima ganharam teste no mesmo commit da correção; é o padrão a seguir.
- Registre o incidente aqui embaixo, mesmo o que não foi notificado. O art. 33(5) exige
  documentar **todas** as violações, notificadas ou não.

## Registro de incidentes

| Data | O que | Titulares | Notificado? | Onde está o relato |
|---|---|---|---|---|
| — | Nenhum até hoje | — | — | — |

---

*Não sou advogado e este documento não é parecer jurídico. A decisão de notificar num caso
concreto merece meia hora de um profissional — mas ela precisa caber dentro das 72 horas,
e é por isso que este plano existe.*
