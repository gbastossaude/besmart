# Atos Sistema — v1.4

Gestão comercial para corretoras de planos de saúde: leads, CRM, distribuição, follow-ups,
agenda com convites, vendas, implantação integrada ao CRM, clientes, comissões com grade por
produto e por corretor, metas, ranking, relatórios, presença da equipe e auditoria.

Hierarquia **Administrador → Gerente → Supervisor → Corretor** garantida no banco (RLS):
cada pessoa só enxerga a própria estrutura, mesmo acessando a API diretamente.

> O `index.html` na raiz do repositório é o playbook de vendas **BeSmart** (página independente).
> O sistema Atos fica na pasta `web/`.

---

## O que há de novo na v1.4

**Correções**

| Problema | O que mudou |
|---|---|
| Entre 21h e 0h (horário de Brasília) o banco, em UTC, já estava no dia seguinte: contato recém-feito aparecia com **-1 dia sem contato**, e venda/implantação ganhava a data de amanhã | Datas de "hoje" calculadas no fuso de São Paulo (relacionamento, lembretes, data da venda, implantação, pendências atrasadas) |
| O **link da reunião** aceitava `javascript:` — quem clicasse em "Entrar na reunião" executava código na própria sessão | Link só com `https://` (validado na tela **e** no banco); links antigos inválidos são limpos |
| Cliques repetidos em "Salvar", "Enviar", "Concluir"… podiam **gravar em dobro** | Todo botão com ação fica desabilitado, com indicador, até a ação terminar |
| "Marcar como prioritário" em lote mostrava sucesso mesmo quando falhava | Informa quantos foram alterados e quantos não puderam ser |
| Busca do CRM e de Leads: digitando rápido, um resultado antigo podia substituir o novo | Só o resultado da última busca é exibido |
| Follow-ups no celular: o **nome do contato sumia** e o botão "Concluir" ficava fora da tela | Listas reorganizam o conteúdo em telas estreitas |
| Mensagens técnicas na tela (`Failed to fetch`, `violates check constraint`, `JWT expired`…) | Mensagens claras para falta de conexão, tempo esgotado, sessão expirada, servidor instável e dados inválidos (o detalhe técnico vai para o console) |
| Uma falha de carregamento deixava a seção "carregando" para sempre | A seção mostra o erro com **Tentar novamente** |
| Login: sem validação, sem indicação de progresso; a auditoria de login podia impedir a entrada | Validação, "Entrando…", mostrar senha, último e-mail lembrado; a auditoria não bloqueia mais o acesso |

**Experiência e visual**

| Recurso | Onde |
|---|---|
| **Tema claro**, escuro ou igual ao do sistema | Menu do usuário → Aparência |
| **Celular**: navegação inferior, filtros recolhidos em "Filtros (n)", tabelas viram cartões, janelas abrem de baixo para cima, avisos no topo, sem rolagem lateral em nenhuma tela | automático |
| Erro mostrado **no próprio campo** do formulário (obrigatório, e-mail, CPF, CNPJ, telefone, link) | Formulários |
| Aviso fixo de **sem conexão** e recarga automática quando a internet volta | automático |
| **Sessão expirada** volta para o login com a explicação | automático |
| **Atalhos de teclado**: `Ctrl/⌘ K` busca, `N` novo, `G` + `D/C/L/A/V/F/T` navega, `?` ajuda | Menu do usuário → Atalhos |
| Acessibilidade: foco preso e devolvido nas janelas, menus por teclado, linhas de tabela e cartões acionáveis com Enter, contraste AA nos textos pequenos, "Pular para o conteúdo", áreas de toque maiores | — |

**Desempenho e segurança**

| Item | Detalhe |
|---|---|
| `demo.js` (~180 KB) não é mais baixado em produção | só no modo demonstração |
| Atualizações automáticas pausam com a aba em segundo plano | menos consultas ao banco |
| Requisições com limite de tempo (30 s; 5 min para envio de arquivo) | nenhuma tela espera para sempre |
| `web/_headers` (Netlify): CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, HSTS | publicado junto com a pasta `web` |
| Storage: envio só por usuário **ativo** e na **própria pasta**; só PDF, imagem e Word | `07_supabase_storage_cron.sql` |
| Exportação CSV não executa fórmulas ao abrir no Excel (`=`, `+`, `-`, `@`) | Exportar |
| Edge Functions: token comparado em tempo constante, limite de tamanho, erros sem detalhes internos, link do convite fixável por `ATOS_SITE_URL` | `supabase/functions` |
| Índices novos para relacionamento, follow-ups do cliente e comissões do corretor | `09_atualizacao_v1_4.sql` |

## Atualizar para a v1.4 (de qualquer versão anterior)

Nenhum dado é apagado. Os scripts podem ser executados mais de uma vez.

1. **Banco** — Supabase → *SQL Editor* → cole todo o `sql/atos_completo.sql` → **Run**
   (já inclui o novo `09_atualizacao_v1_4.sql`).
2. **Storage** — rode de novo o `sql/07_supabase_storage_cron.sql` (aplica a nova regra de envio de arquivos).
3. **Site** — publique a pasta `web` inteira no Netlify (inclui o novo arquivo `_headers`).
   Se o seu Supabase usar um domínio próprio (não `*.supabase.co`), ajuste o `connect-src` em `web/_headers`.
4. **Edge Functions** — atualize `convidar-usuario` e `receber-lead`. Opcional: defina o segredo
   `ATOS_SITE_URL` com o endereço do site (ex.: `https://atos.netlify.app`) para o link do convite.

---

## Histórico — v1.1 a v1.3

## O que há de novo na v1.1

| Recurso | Onde |
|---|---|
| **Grade de comissão do corretor** — Ouro, Prata, Bronze e Externo (e outras que você criar) | Configurações → Grades de comissão · Comissões → Grades e corretores |
| **Grade por produto** — quanto a corretora **recebe** da operadora e quanto **paga** ao supervisor e a cada grade, parcela a parcela, com margem calculada | Produtos → editar produto · Comissões → Grade de comissão |
| **Importar a grade** por planilha (CSV ou Excel) e baixar a grade atual | Comissões → Importar grade |
| Venda aprovada gera as comissões pela **grade do produto × grade do corretor** (produtos sem grade continuam usando as regras) | automático |
| **Agenda com convites** para reuniões e treinamentos, confirmação de presença (vou / talvez / não vou), **lembrete** e compartilhamento (WhatsApp, e-mail, Google Agenda, arquivo .ics) | Agenda |
| **Vendas geral, por equipe e por corretor** | Vendas (abas) · Dashboard |
| **Ranking por corretor, supervisor e equipe** | Ranking |
| **Etapas do CRM, status do lead e etapas da implantação editáveis e excluíveis** (com transferência dos registros) | Configurações → CRM e implantação |
| **Notificações** de novo lead (supervisor/gerente) e de **SLA atrasado**, em tempo real, com alerta no navegador | automático · Configurações → Parâmetros |
| **Quem está online** no painel e tela própria para gerente/supervisor | Dashboard · Gestão → Quem está online |

**Também nesta versão**

| Recurso | Onde |
|---|---|
| Grade com até **3 parcelas**, linha **Total** (soma por tipo de corretor) e simulação em R$; parcela sem valor não aparece para o corretor | Produtos · Comissões |
| Parcelas sempre em ordem (1ª, 2ª, 3ª) em todas as listas de comissão | Comissões · Venda · Cliente |
| **Relacionamento**: lembrete diário ao responsável do aniversário do cliente e dos dependentes e de clientes sem contato, com **mensagem pronta** para enviar pelo WhatsApp (o envio registra o contato) | Relacionamento · Minha carteira · Notificações |
| **Desempenho individual**: cada corretor comparado com ele mesmo no mês anterior (produção, vendas, conversão, leads, ticket e 6 meses) | Gestão → Desempenho |
| **Ranking ao vivo** por corretor, equipe (com **logotipo**) e supervisor, com pódio, mudança de posição e **modo TV** | Gestão → Ranking ao vivo · Configurações → Equipes |

**CRM integrado à implantação**

| Recurso | Onde |
|---|---|
| Lead que chega em **Aprovado** no CRM vira cliente e a venda entra na etapa inicial da implantação (**Venda realizada**) | CRM (arrastar para Aprovado) · página do lead |
| O card do CRM e a página do lead mostram **em que etapa a implantação está**, com barra de progresso e link | CRM · Lead |
| A implantação conduz o resto: **Aprovado** (operadora) gera as comissões e **Implantado** leva o lead para *Implantado* no CRM | Implantação |
| Menu **Propostas** removido (propostas antigas continuam no histórico do lead) e **valor total** removido de Vendas | — |
| Dashboard e Inteligência: **Em implantação** e **implantações paradas** no lugar das propostas | Dashboard · Inteligência Comercial |

---

## Atualizar um Atos que já está instalado (v1.0 → v1.1)

Nenhum dado é apagado. Os scripts podem ser executados mais de uma vez.

1. **Banco** — Supabase → *SQL Editor* → *New query* → cole todo o conteúdo de
   `sql/atos_completo.sql` → **Run**. Deve terminar com *Success. No rows returned*.
2. **Rotinas e tempo real** — nova query com `sql/07_supabase_storage_cron.sql` → **Run**.
   Isso cria a rotina de 1 em 1 minuto (SLA e lembretes) e liga o tempo real das notificações.
   Se aparecer erro de `pg_cron`, ative em *Database → Extensions → pg_cron* e rode de novo.
3. **Site** — publique a pasta `web` de novo no Netlify (*Deploys → arraste a pasta*).
   O `web/js/config.js` já vem com a sua URL e chave pública.
4. **Convites de usuário** — Supabase → *Edge Functions* → `convidar-usuario` → substitua o
   código pelo de `supabase/functions/convidar-usuario/index.ts` → *Deploy* (agora aceita a grade).
5. Entre como administrador e confira em **Configurações → Grades de comissão**: todos os
   corretores atuais começam na grade **Bronze**. Ajuste a grade de cada um e cadastre a grade
   dos produtos (ou importe a planilha em **Comissões → Importar grade**).

## Instalação do zero

1. Crie o projeto no Supabase. Em *Project Settings → API* copie a **Project URL** e a
   **Publishable key** (a chave pública; nunca use a *secret/service_role* no site).
2. *SQL Editor* → rode `sql/atos_completo.sql` e depois `sql/07_supabase_storage_cron.sql`.
3. *Authentication → URL Configuration*: coloque o endereço do Netlify em **Site URL** e em
   **Redirect URLs**.
4. Preencha `web/js/config.js` com a URL e a chave pública e publique a pasta `web` no Netlify.
5. Crie a conta com o e-mail do administrador master (`gbastossaude@gmail.com`) em
   *Solicitar acesso* — ele vira administrador automaticamente.
6. Edge Functions (opcional): `convidar-usuario` (convites por e-mail) e `receber-lead`
   (site, Meta Leads, Google Ads — defina o segredo `ATOS_WEBHOOK_TOKEN`).

## Planilha da grade de comissão

Uma linha por produto e parcela; percentuais sobre a mensalidade:

```
operadora;produto;parcela;corretora;supervisor;ouro;prata;bronze;externo
Amil;Amil S380 QC;1;200;10;120;100;80;140
Amil;Amil S380 QC;2;100;5;50;40;30;0
```

`corretora` = o que a operadora paga à corretora. As demais colunas = o que a corretora paga.
Aceita vírgula decimal e colunas pelo código ou pelo nome da grade.

## Segurança

- Toda regra de acesso está no banco (RLS + funções). O navegador só usa a chave pública.
- Corretor vê somente a própria linha da grade de comissão; o que a corretora recebe e a
  margem ficam restritos a quem tem a permissão *comissoes.ver*.
- Grade do corretor, papel, equipe e status só podem ser alterados pelo administrador.
- Presença: cada um vê a própria; supervisor vê a equipe; gerente a gerência (permissão
  *presenca.ver*, ajustável em Permissões).

## Estrutura

```
sql/            01 estrutura · 02 funções/triggers · 03 RLS · 04 views · 05 RPCs · 06 configuração
                08 atualização v1.1 · 09 atualização v1.4 · atos_completo.sql (tudo junto)
                07 Supabase (storage, cron, realtime)
web/            site (HTML + CSS + JS, sem build) — publicar no Netlify (inclui _headers)
supabase/       Edge Functions
test/           testes do banco (PGlite), do motor de demonstração e da interface (Playwright)
dist/           prévia em arquivo único (modo demonstração)
```

### Testes

```
npm install                 # instala o PGlite (PostgreSQL em memória) para os testes do banco
npm test                    # SQL completo + RLS/regras (190) + motor de demonstração (51) + script 07
pip install playwright      # testes de interface
npm run test:ui             # 35 telas × 4 perfis + testes da v1.4 (login, erros, segurança, tema, celular)
```

Se o Chromium do Playwright não estiver instalado, aponte para um existente com `PW_CHROMIUM=/caminho/do/chrome`.
O `test/upgrade.test.mjs` precisa do arquivo `test/atos_v1_0.sql` (banco v1.0 de referência), que não acompanha este pacote.
