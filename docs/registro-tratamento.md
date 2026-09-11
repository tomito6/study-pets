# Registro das operações de tratamento

> **O que é isto.** O documento que o art. 30 do GDPR chama de *Verzeichnis von
> Verarbeitungstätigkeiten*, e que o art. 37 da LGPD chama de registro das operações.
> É **interno**: não vai pro ar, não é a política de privacidade. É o que se mostra a uma
> autoridade que pergunte "que dados você trata, por quê, com quem, e por quanto tempo".
>
> **Por que existe mesmo sendo um projeto pequeno.** O art. 30(5) dispensa quem tem menos
> de 250 pessoas — mas só quando o tratamento é *ocasional*. Aqui ele é contínuo e é o
> serviço em si, então a dispensa não se aplica. Escrever agora leva uma tarde; escrever
> depois de alguém perguntar é impossível.
>
> **Como manter.** Mudou o que se guarda, apareceu um terceiro novo, mudou a finalidade?
> Este arquivo muda no mesmo commit. O histórico do git é a prova de quando cada coisa
> passou a valer.

Versão de 11 de setembro de 2026 · [política pública](../public/legal/privacidade.html) · [plano de incidente](plano-de-incidente.md)

---

## 1. Responsável

| | |
|---|---|
| Nome | Tomás Spielmann |
| Endereço | **[preencher: endereço postal completo]** |
| Contato | **[preencher: e-mail de contato do projeto]** |
| Encarregado (DPO) | Não designado — o tratamento não atinge os limiares do art. 37 do GDPR nem do art. 41 da LGPD para agente de pequeno porte. O contato acima responde pelos pedidos. |
| Representante na UE | Não se aplica: o responsável está estabelecido na Alemanha. |

## 2. Finalidades, e a base legal de cada uma

| Finalidade | Base legal (GDPR) | Base legal (LGPD) |
|---|---|---|
| Criar e manter a conta do usuário | Art. 6(1)(b) — execução do contrato | Art. 7, V |
| Guardar e sincronizar o plano de estudo, os checks, os eventos e o progresso do jogo | Art. 6(1)(b) | Art. 7, V |
| Guardar a lista de sites que o usuário quer bloquear durante o estudo | Art. 6(1)(b) | Art. 7, V |
| Enviar e-mail de redefinição de senha e de verificação | Art. 6(1)(b) | Art. 7, V |

Não há tratamento para marketing, perfilamento, publicidade ou venda de dados. Não há
decisão automatizada com efeito jurídico (art. 22 do GDPR / art. 20 da LGPD). Não há
tratamento de categorias especiais **por finalidade** — ver a ressalva no item 4.

## 3. Categorias de titulares

Usuários registrados do aplicativo. Hoje: uma pessoa (o próprio responsável). A partir da
abertura ao público: estudantes, maiores de 16 anos por declaração no cadastro.

## 4. Categorias de dados pessoais

| Categoria | Campos | Origem |
|---|---|---|
| Identificação | e-mail; nome e foto do perfil quando o login é pelo Google | O titular, ou o provedor de autenticação |
| Identificador técnico | `uid` gerado pelo Firebase Authentication | Gerado no cadastro |
| Rotina de estudo | janelas de estudo, ritmo do pomodoro, meta diária, blocos marcados (`checks`), dias encerrados, pausas | O titular, no app |
| Compromissos | nome, dia e hora de eventos e séries recorrentes | Digitados, ou importados de arquivo `.ics` |
| Anotações | nome e objetivo de grupos de estudo; nomes dados aos pets | O titular |
| Progresso do jogo | XP, moedas, pets, skills, penalidades do modo hardcore | Gerado pelo uso |
| Preferências | lista de sites a bloquear, aparência do personagem, tema | O titular |

**Ressalva importante — categorias especiais por acidente.** O app não pede dado sensível,
mas dois campos podem receber um: o nome de um compromisso importado (*"consulta médica"*,
*"terapia"*) e a lista de sites bloqueados, que revela interesse por inferência. Os dois são
texto livre preenchido pelo titular sobre si mesmo. Mitigação em vigor: a importação de
calendário tem tela de revisão item a item antes de qualquer coisa entrar, e a política
pública avisa disso em seção própria.

**Dados de terceiros.** Um compromisso importado pode conter o nome de outra pessoa
("reunião com Fulano"). O titular é quem decide o que importa, na tela de revisão.

## 5. Destinatários

| Quem | Papel | O que recebe | Onde |
|---|---|---|---|
| Google Ireland Ltd. / Google LLC | Operador (Firebase Authentication e Cloud Firestore) | Conta e documento completo do usuário | **[preencher: região do Firestore — conferir no console]** |
| Vercel Inc. | Operador (hospedagem e entrega do aplicativo) | Requisições HTTP do app; não recebe o conteúdo do documento | Edge global; a entrega ao usuário europeu sai da região de Frankfurt |

Nenhum outro terceiro recebe dado pessoal. Em particular, **as fontes tipográficas são
servidas pelo próprio domínio desde 11/09/2026**, então carregar o app não transmite o
endereço IP do visitante a terceiro nenhum. Não há analytics, rastreador, pixel ou rede de
anúncio — verificável por busca no código: não existe `fetch`, `sendBeacon` ou `<script>`
externo em `src/` ou `extension/`.

**A extensão de navegador** trata os endereços das abas abertas **inteiramente no
dispositivo do usuário**, para saber qual redirecionar. Não tem servidor e não transmite
nada. Não é, portanto, tratamento pelo responsável.

## 6. Transferência internacional

Google e Vercel são empresas estadunidenses e podem tratar dados nos EUA.

- **Fundamento**: adesão ao *EU-US Data Privacy Framework*, e cláusulas contratuais-padrão
  da Comissão Europeia como reserva (art. 46(2)(c) do GDPR).
- **LGPD**: art. 33, II, "c" — cláusulas-padrão contratuais.
- **Contrato de operador (art. 28)**: o adendo de tratamento de dados do Google Cloud é
  aceito por adesão ao usar o Firebase. **Pendência conhecida**: o DPA da Vercel vale para
  os planos Pro e Enterprise; no plano Hobby, atual, não há contrato de operador formalizado.
  Resolver antes do primeiro usuário externo — ver a Fase 2 em `docs/juridico.html`.

## 7. Prazos de eliminação

| O quê | Prazo hoje |
|---|---|
| Documento do usuário (`users/{uid}`) | Enquanto a conta existir. Apagado imediatamente e por inteiro em "Apagar conta", **antes** da conta de autenticação |
| Conta de autenticação | Idem, logo em seguida |
| Cópia local no dispositivo | Fica no navegador do usuário até ele limpar os dados do site. A política pública avisa |
| Conta abandonada | **Sem prazo automático.** Ver a decisão pendente abaixo |

> **Decisão pendente — retenção de conta abandonada.** Hoje nada expira: o documento é um
> diário minuto a minuto que cresce para sempre. A regra proposta é *"conta sem acesso por
> 24 meses é apagada, com aviso por e-mail 30 dias antes"*. **Ela ainda não foi implementada
> nem prometida em lugar nenhum** — e a política pública diz corretamente que o app não
> apaga nada sozinho. Não escreva a regra na política antes de o código fazê-la: prometer o
> que não se cumpre é pior do que não ter prazo.

## 8. Medidas técnicas e organizacionais (art. 32)

- **Isolamento por titular.** As regras do Firestore (`firestore.rules`) só permitem que
  cada conta leia e escreva o próprio documento; qualquer outro caminho é negado por padrão.
  Não existe consulta no app que leia o documento de outra pessoa.
- **Criptografia.** Em trânsito por TLS; em repouso, pelo padrão do Google Cloud.
- **Autenticação.** Delegada ao Firebase Authentication. Senha mínima de 8 caracteres —
  acima do mínimo de 6 do provedor. Mensagem de erro idêntica para e-mail inexistente e
  senha errada, para não revelar quais e-mails têm conta.
- **Integridade na escrita.** Nenhum save sai antes de o documento ter sido lido com
  sucesso (`blockSaves`), e uma resposta de leitura que chega depois de a sessão trocar de
  dono é descartada. Sem isso, uma falha de rede podia gravar dado de um titular no
  documento de outro — corrigido em 11/09/2026, com teste.
- **Minimização.** Não se coleta IP, não há log de acesso próprio, e a declaração de idade
  guarda só um booleano, nunca a data de nascimento.
- **Direitos do titular, automatizados.** "Baixar (JSON)" e "Apagar conta" dentro do app,
  sem depender de pedido nem de resposta humana.
- **Segredos.** Nenhuma credencial no repositório — verificado varrendo o histórico inteiro.
  A chave de API do Firebase que aparece no código é pública por natureza; quem protege os
  dados são as regras do servidor.
- **Pendência conhecida.** Não há backup nem recuperação a ponto no tempo: as duas
  ferramentas do Firestore exigem faturamento ativo, e o projeto está no plano gratuito.
  Enquanto isso, o único resgate é o JSON baixado à mão — e ele **não tem caminho de volta**,
  porque o app não importa. Este é o item mais fraco deste registro.

## 9. Violação de dados

Procedimento em [`plano-de-incidente.md`](plano-de-incidente.md). Autoridade competente:
*Bayerisches Landesamt für Datenschutzaufsicht* (BayLDA), por ser a Baviera o estado do
responsável. No Brasil, a ANPD.

---

*Não sou advogado e este documento não é parecer jurídico. Ele descreve, com honestidade, o
tratamento que o código realmente faz — inclusive as pendências.*
