# Erbe · Central — Supabase + Netlify

Sistema próprio da **Erbe Proteção e Patrimônio**, com banco de dados real e
login por e-mail. Saúde, proteção e patrimônio para quem pensa no amanhã.
São quatro arquivos — `index.html`, `config.js`, `netlify.toml` e `schema.sql` —
e a pasta **`vendor/`** (as bibliotecas que geram o PDF e a fonte Sora dos
relatórios). Publique sempre a pasta inteira, com a `vendor/` dentro.

A conta master é **gbastossaude@gmail.com**. Quem entrar com esse e-mail vira
gestor automaticamente. Todo mundo mais entra como **pendente** e não enxerga
nada até você liberar.

---

## 1. Criar o banco (Supabase) — 10 minutos

1. Em **supabase.com**, crie uma conta e um projeto novo.
   Anote a senha do banco que ele pedir; guarde num lugar seguro.
2. Escolha a região **South America (São Paulo)** — o sistema fica mais rápido.
3. Menu lateral → **SQL Editor** → **New query**.
4. Cole o conteúdo inteiro de `schema.sql` e clique em **Run**.
   Ele cria as tabelas, as regras de segurança e o cadastro automático.
   Pode rodar de novo quando quiser, não duplica nada.
   **Se você já rodou uma versão anterior, rode este de novo:** ele acrescenta a
   tabela de vidas e os índices novos sem tocar no que já está gravado.
5. Menu lateral → **Authentication → Providers → Email**:
   deixe **Enable Email provider** ligado.
   Para começar rápido, **desligue "Confirm email"** — assim a conta
   funciona na hora, sem esperar e-mail. Ligue depois, quando configurar
   um servidor de e-mail próprio (item 5 aqui embaixo).
6. Menu lateral → **Settings → API Keys**. Copie:
   - **Project URL**
   - **Project API keys → anon / public**

## 2. Preencher o `config.js`

Abra `config.js` e cole os dois valores:

```js
window.ERBE_CONFIG = {
  url:     "https://xxxxxxxx.supabase.co",
  anonKey: "eyJhbGciOi..."
};
```

A chave `anon` é pública de propósito — ela sozinha não abre nada, porque
quem decide o que cada pessoa alcança são as regras de segurança do banco.
**Nunca** use aqui a chave `service_role`.

## 3. Publicar (Netlify) — 5 minutos

**Jeito mais simples, sem Git:**
1. Entre em **app.netlify.com** → **Add new site** → **Deploy manually**.
2. Arraste a pasta inteira (os quatro arquivos **e a pasta `vendor/`**) para a
   área indicada. Sem a `vendor/`, o Excel continua funcionando, mas o PDF passa
   a depender da internet para baixar as bibliotecas.
3. Pronto. O Netlify devolve um endereço tipo `algo-aleatorio.netlify.app`.
4. Em **Site configuration → Change site name**, troque para algo como
   `erbe-central`.

**Se quiser versionamento:** crie um repositório no GitHub com estes
arquivos e use **Add new site → Import an existing project**. A cada
alteração enviada, o Netlify republica sozinho.

**Domínio próprio:** em **Domain management → Add a domain**, aponte
`sistema.suamarca.com.br` para o Netlify. O certificado HTTPS é automático.

## 4. Fechar o cerco no Supabase

Depois de publicar, volte ao Supabase → **Authentication → URL Configuration**:

- **Site URL**: o endereço do Netlify (ex.: `https://erbe-central.netlify.app`)
- **Redirect URLs**: o mesmo endereço, com `/*` no fim

Sem isso, o link de acesso enviado por e-mail não volta para o sistema.

## 5. E-mail próprio (quando a equipe crescer)

O servidor de e-mail embutido do Supabase é limitado a poucas mensagens por
hora — serve para testar, não para uso diário. Em **Authentication → Emails →
SMTP Settings**, ligue um serviço próprio (Resend, Brevo e SendGrid têm plano
gratuito). Aí você pode reativar o "Confirm email" com segurança.

---

## Trazer os dados que já existem

1. Na versão anterior do sistema, vá em **Configurações → Baixar backup (JSON)**.
   O conteúdo vai para a área de transferência.
2. No sistema novo, entre com a conta master, vá em **Configurações →
   Importar backup**, cole e confirme.

Registros com o mesmo identificador são sobrescritos; o que já existe e não
está no backup continua onde está.

---

## Como funciona o acesso

| | Gestor | Corretor | Assistente |
|---|---|---|---|
| Carteira | tudo | só a dele | tudo |
| Comissões | valor cheio e o que fica com a corretora | só a parte dele | não |
| Monta o cronograma de comissão | sim | não | não |
| Desfaz um recebimento de comissão | sim | não | não |
| Exclui cliente ou contrato | sim | não | não |
| Despesas | sim | não | não |
| Configurações e liberação de acesso | sim | não | não |

O corretor marca uma parcela como recebida, mas não desfaz: conciliação
errada volta pela sua mão. Cliente e contrato também só você apaga — junto
com eles iriam o histórico e a comissão já conciliada.

**O corretor não vê o lado da corretora.** Onde antes aparecia o valor cheio
da parcela, ele vê apenas a sua comissão — na tela de Comissões, na ficha do
contrato, nos relatórios, na análise de operadoras e no painel inicial. O
percentual da régua, o split e o valor cheio somem junto, porque com base e
percentual daria para recalcular o que fica com a corretora. Quem monta o
cronograma de comissão é o gestor; o corretor registra o contrato e acompanha
a parte dele.

Se você quiser que alguém específico enxergue tudo sem virar gestor, abra
**Equipe → Editar** e mude o *Alcance* para **“A corretora inteira — inclusive
o que fica com ela”**.

Um detalhe sobre metas: para quem não vê o lado da corretora, a barra de meta
compara a **comissão dele** com a meta. Então cadastre a meta do corretor nessa
mesma base.

**A diferença para a versão anterior:** agora isso vale no banco, não só na
tela. Um corretor que tentasse ler o contrato de outro por fora do sistema
receberia zero linhas — foi testado. Quem está pendente não enxerga nada e
não consegue se promover.

Uma ressalva honesta: o assistente não vê comissão **na tela**, mas o valor
viaja junto do contrato no banco. Se isso for importante para você, dá para
separar as comissões numa tabela própria depois — é um passo a mais, não uma
refação.

## Agenda e lembretes

Cada tarefa pode ser **editada** (✎) e **adiada** — 1, 3, 7, 15 ou 30 dias, ou
uma data escolhida. O sistema conta quantas vezes a tarefa já foi empurrada e
mostra isso na linha; serve para perceber o follow-up que você vem evitando.

Ao abrir o sistema aparece um **lembrete no canto** com o que vence hoje e o
que já venceu, com botões de concluir e adiar ali mesmo. Ele volta a checar a
cada minuto. “Lembrar em 1h” silencia por uma hora; “Hoje não”, por dez. Só
aparecem as tarefas de quem está logado.

## Novidades de 29/09 (noite)

Não precisa rodar o `schema.sql` de novo para esta versão — os campos novos
ficam dentro dos registros que já existem. Basta publicar a pasta inteira
(com a `vendor/`).

**Relatórios em Excel e PDF, com o logotipo.** Em qualquer tela com o botão
**Baixar** (Clientes, Contratos, Vidas e cotas, Comissões, Relatórios) abre um
diálogo com sete relatórios: carteira de clientes, contratos, vidas e cotas,
comissões, previsão de comissões, cancelamentos e produção por corretor.
Cada um tem os seus filtros (período, pilar, operadora, corretor, situação).
O Excel sai com cabeçalho fixo, filtro em cada coluna, totais que acompanham
o filtro, valores em R$ e datas de verdade, e uma aba de resumo quando faz
sentido. O PDF sai pronto para imprimir, com números-chave no topo e
"Página X de Y". As regras de acesso valem aqui também: o corretor só baixa a
carteira dele e a parte dele da comissão; o assistente não vê comissão.

**Comissões.**
- Toda parcela de consórcio leva a etiqueta **Consórcio**, e há filtro por pilar.
- A coluna se chama **Data prevista** — é quando a comissão deve entrar.
- **Imposto:** em Configurações → Comissões e avisos, defina a alíquota
  padrão (ex.: a do Simples). Dá para mudar por contrato e por parcela. O
  gestor passa a ver valor bruto, imposto, repasse do corretor e o líquido da
  corretora; o balanço do mês desconta o imposto.
  *Decisão que é sua:* por padrão o repasse do corretor é calculado sobre o
  **valor bruto** (o imposto sai só da parte da corretora). Se preferir que
  seja sobre o líquido, troque em Configurações → "Repasse do corretor
  calculado sobre".
- **Previsão de comissões** (substitui a antiga "Projeção"): recebido nos
  últimos 6 meses e previsto para os próximos 12. O verde é o que já está
  lançado nos contratos — cresce conforme você cadastra as parcelas. O ocre é
  a estimativa de vendas novas, por **ritmo de vendas** (a média dos últimos 6
  meses, distribuída pela curva real de pagamento da carteira) ou pelo
  **funil** (leads ponderados pela etapa). Os dois estimam a mesma coisa e
  nunca se somam.

**Régua que se preenche sozinha.** No contrato novo, a primeira régua do
pilar já vem escolhida: digite a mensalidade, o prêmio ou o crédito e o
cronograma aparece. Trocar a régua, o valor ou as datas refaz tudo, até você
editar alguma parcela à mão — a partir daí o que você digitou manda. Embaixo
aparece como o contrato entra na previsão dos próximos 12 meses.

**Vidas e cotas.** A aba agora mostra as cotas de consórcio (crédito,
contempladas, a contemplar, parcelas, por administradora e por bem) e tem o
botão **Baixar carteira (Excel ou PDF)**.

**Aniversários.** Pessoa física: data de nascimento. Empresa: data de
fundação e, novo, o **contato principal** com o nascimento e o WhatsApp dele.
O pop-up avisa com a antecedência que você escolher (padrão 7 dias; 0 = só no
dia) e traz o botão **Parabenizar no WhatsApp**, com a mensagem pronta — ao
clicar, o aniversário fica marcado como parabenizado e conta como contato de
pós-venda. A antecedência muda em Configurações ou no painel de pós-venda.

**Ficha do cliente.** Botão **✎ Editar dados** no topo da ficha e em cada
linha da lista de clientes. A ficha mostra o próximo aniversário e a seção
**Comissões do cliente**, com a data prevista de cada parcela.

## ⚠ Revisão de 29/09 — rode o schema.sql de novo

Uma revisão independente do código achou uma falha de segurança no banco:
**qualquer pessoa que criasse uma conta conseguia se promover a gestor** usando
a chave pública, sem passar pela sua liberação. Confirmei a falha num
PostgreSQL de verdade e confirmei a correção do mesmo jeito.

Para fechar a falha no seu projeto: **Supabase → SQL Editor → cole o
`schema.sql` inteiro → Run.** Não apaga nada que já esteja gravado.

O que o schema.sql novo corrige:

- Só o gestor muda papel, situação, alcance, meta e split de alguém. Cada
  pessoa continua podendo mudar o próprio nome.
- Só o e-mail master nasce gestor. Antes, "o primeiro a se cadastrar" também
  virava gestor.
- Vidas seguem o contrato: se o contrato muda de corretor, as vidas vão junto
  e o corretor antigo deixa de ver CPF e nascimento daquelas pessoas.
- Apagar um contrato apaga as vidas dele no banco.

Depois de rodar, confira em **Table Editor → perfis** se o seu usuário
continua gestor e ativo, e se ninguém ali virou gestor sem você saber.

## Vidas — o módulo novo

Vida deixou de ser um número dentro do contrato e virou registro próprio:
titular ou dependente, com entrada, saída, situação (ativa, pendente, inativa,
cancelada) e histórico. É o que faz o sistema responder **quantas vidas temos**,
por produto, por operadora e por corretor.

Nos contratos que já existem, o número continua valendo até você detalhar. A aba
**Vidas** mostra quantas ainda estão sem nome e tem um botão **Detalhar**: você
cola os nomes, um por linha, e o sistema cria as vidas de uma vez. Enquanto não
detalhar, nenhum painel zera — o número do contrato é usado como está.

Excluir do plano não apaga nada: muda a situação para cancelada e grava a data de
saída, para o histórico de movimentação ficar de pé.

Consórcio não conta vida: conta cota. O painel executivo separa as duas coisas.

## O que mudou nesta versão

- **Histórico completo.** A trilha de auditoria não se apaga mais e passou a
  guardar valor anterior e valor novo de cada alteração de contrato, cliente,
  vida, comissão e tarefa. Na tela de Atividade isso aparece como
  ~~valor antigo~~ → valor novo.
- **Carteira grande.** Medido com 5.000 clientes e 6.667 contratos: a carteira
  abria em 40 segundos e agora abre em 0,17; comissões caiu de 10,8 s para 0,8 s;
  relatórios, de 4,2 s para 0,09 s. As listas passaram a carregar por blocos.
- **Cliente único.** O mesmo CPF ou CNPJ não entra duas vezes: o sistema avisa
  enquanto você digita e, ao salvar, oferece abrir o cadastro que já existe.
- **Ficha por produto.** Saúde ganhou modalidade, mês de reajuste e último
  reajuste. Proteção ganhou apólice, ramo e importância segurada. Patrimônio
  ganhou grupo, cota, bem, prazo, parcela e contemplação.
- **Cross-sell.** O painel inicial lista quem já é cliente e ainda não tem um
  dos três pilares, ordenado por comissão gerada, com um botão que agenda o
  contato.
- **Renovações em escada:** 7, 15, 30, 60 e 90 dias.
- **Exportação em CSV** (abre no Excel) em vidas, clientes, contratos e comissões.

## O que entrou na revisão de 29/09

**Informações novas**

- **Faixa etária da ANS.** A tela de Vidas mostra as vidas de saúde pelas dez
  faixas da RN 63 e lista quem muda de faixa nos próximos 60 dias — o boleto
  sobe no mês seguinte ao aniversário. Depende da data de nascimento, que
  continua opcional.
- **Reajuste anual.** Renovações mostra os contratos de saúde que reajustam nos
  próximos 60 dias, com o último percentual aplicado. Depende do "mês de
  reajuste" preenchido no contrato.
- **Aniversário do cliente** (e de fundação, para PJ) nos lembretes de pós-venda.
- **Cancelamento com data e motivo.** A retenção passa a contar pela data do
  cancelamento, e Relatórios ganhou o quadro de motivos.
- **Ficha do cliente com visão única:** produtos que tem e que faltam (com botão
  para oferecer), vidas, último contato, próxima ação, WhatsApp clicável,
  endereço, origem.
- Os três avisos novos (faixa etária, reajuste, aniversário) aparecem no painel.

**Correções de permissão**

- O corretor não vê mais o valor cheio em estimativa de lead, histórico de
  atividade nem no aviso de exclusão em lote.
- O corretor não exclui, não edita e não lança parcela avulsa — só o gestor.
- Na ficha do cliente e nos relatórios, o corretor vê só os contratos dele.
- O assistente não vê comissão em tela nenhuma.
- Quem abre o sistema sem estar na equipe cai na tela de espera, e não no
  painel do gestor.

**Correções de dado**

- Editar um contrato podia trocá-lo de cliente sem aviso; editar uma vida
  podia trocá-la de contrato. Corrigido.
- "Cancelar" no aviso de excluir vida do plano excluía a vida. Corrigido.
- Converter um lead com CNPJ já cadastrado criava um cliente duplicado. Agora
  o contrato entra no cliente que já existe.
- Vidas de contrato cancelado deixaram de contar como ativas; apagar contrato
  apaga as vidas dele.
- O histórico registrava zero mudanças em várias ações (conciliar, excluir
  parcela, mover lead). Agora registra.
- A busca por nome na tela de Vidas não filtrava. Filtra.

## A marca no sistema

As cores, a tipografia (Sora) e os nomes dos três pilares — **Saúde**,
**Proteção** e **Patrimônio** — seguem o manual da marca. A Sora vai embutida
no próprio `index.html`: o sistema não busca fonte na internet e abre igual
mesmo offline.

O escudo e a assinatura horizontal foram **extraídos em vetor do próprio
Manual da Marca** (página "Versões do logotipo") — são os traços do arquivo
original, não um redesenho. No fundo claro entra a versão principal (escudo
preto); no fundo preto, a negativa (escudo verde), como o manual pede. Ele
aparece na barra lateral, no login, em **Configurações → Identidade** e no
cabeçalho de todo relatório em Excel e PDF. Se um dia o manual mudar, cole o
novo `.svg` em **Configurações → Identidade → Usar outro arquivo**.

Uma observação sobre cor: o Amarelo Leve (#F1E1A0) do manual não tem contraste
para texto ou para barra de gráfico sobre fundo claro — o próprio manual diz
que ele só entra como detalhe. Onde o pilar Proteção precisa de cor em fundo
claro, o sistema usa um ocre derivado dele (#B8840C nos gráficos, #8A6A12 em
texto). Em fundo escuro, o amarelo da marca aparece como é.

## Manutenção

**Backup**: o Supabase faz backup diário automático no plano gratuito.
Para uma cópia sua, use **Database → Backups** ou o botão de exportar do
próprio sistema.

**Limites do plano gratuito**: 500 MB de banco e 50.000 usuários ativos por
mês. Para uma corretora, isso demora anos para apertar. O aviso que aparece
é de pausa por inatividade — se ninguém abrir o sistema por 7 dias, o projeto
hiberna e volta no primeiro acesso.

**Atualizar o sistema**: troque o `index.html` e republique. O banco não é
afetado.
