# Arquitetura — Erbe · Central

Plataforma de gestão da corretora (Saúde, Proteção e Patrimônio): funil de
leads, carteira de clientes, contratos, vidas e cotas, comissionamento,
renovações, agenda, despesas, relatórios, documentos e auditoria.

```
 Navegador (PWA)                         Supabase
 ┌───────────────────────────┐    HTTPS  ┌──────────────────────────────────┐
 │ public/index.html         │  ───────▶ │ Auth (e-mail/senha, link mágico) │
 │ assets/js/*.js (35 mód.)  │  PostgREST│ PostgreSQL + RLS                 │
 │ estado em memória (S)     │ ◀──────── │  tabelas jsonb + gatilhos        │
 │ índices + cache derivados │  Realtime │  auditoria · versão · automações │
 │ service worker (só código)│  (wss)    │ Storage: bucket privado          │
 └───────────────────────────┘           │ pg_cron (opcional): rotina 7h    │
        ▲  Netlify (estático, CSP)       └──────────────────────────────────┘
```

## 1. Decisões de arquitetura

| Decisão | Por quê |
|---|---|
| **Sem framework e sem build** no front-end; scripts clássicos por domínio. | O sistema já funcionava assim e bem. Reescrever em React/TS seria "recriar do zero", com risco alto. A divisão em módulos + lint entre arquivos + testes dá a manutenibilidade que faltava. Migração gradual para TypeScript via JSDoc está no roadmap. |
| **Dados em `jsonb` (`dados`) + colunas só para segurança/controle** (`id`, `dono`, `versao`, `atualizado_em`). | Formato que a tela já usa; campos novos entram sem migration. O que o banco precisa *entender* (dono, versão, situação do contrato, parcelas) é tratado em gatilhos e funções. |
| **Carga completa em memória** (paginada), cálculos no navegador. | Painéis, previsão e comissões cruzam tudo com tudo; em memória respondem em milissegundos e não custam consulta. Escala testada: 5 mil clientes / 6,7 mil contratos. Acima de ~50 mil contratos, ver roadmap (agregações no servidor). |
| **Segurança no banco** (RLS + gatilhos), a tela só reflete. | A chave do `config.js` é pública por definição; quem decide o que cada um alcança é o PostgreSQL. |
| **Tempo real por delta**. | Uma alteração vira um evento aplicado no estado, não uma releitura geral. |
| **Auditoria por gatilho**. | Não depende de o navegador colaborar; serve de recuperação (lixeira) e de fonte de eventos para integrações. |

## 2. Estrutura do repositório

```
public/                     ← o que vai ao ar (Netlify publica esta pasta)
  index.html                ← casca + CSP + ordem dos scripts
  config.js                 ← URL e chave ANON do Supabase (pública)
  sw.js, manifest.webmanifest, robots.txt
  assets/app.css            ← design system (tokens de cor claro/escuro) e telas
  assets/fonts, assets/icons
  assets/js/
    core.js                 ← constantes de domínio, estado S, utilidades
    erros.js                ← erros globais, banner, registro em erros_app
    validacao.js            ← CPF, CNPJ (inclusive alfanumérico), telefone, e-mail, máscaras
    marca.js                ← escudo oficial e assinatura
    arquivos.js             ← CSV, Excel (.xlsx gerado à mão), ZIP, PDF (jsPDF sob demanda)
    lembrete.js             ← pop-up de tarefas e aniversários
    dados.js                ← salvar/remover, versão, desfazer em falha, trilha legível
    motor.js                ← comissão (régua, cronograma, split, imposto), vidas, índices
    datas-ans.js            ← faixas etárias RN 63, reajustes
    sessao.js               ← login, carga paginada, tempo real, navegação, render
    ui/modal.js, ui/layout.js ← modais acessíveis, celular (gaveta, cartões)
    views/*.js              ← uma tela por arquivo (painel, leads, clientes, ...)
    forms/*.js              ← formulários (lead, contrato, cliente, outros)
    busca.js                ← busca global (Ctrl+K)
    pwa.js                  ← instalação e service worker
    acoes.js                ← despachante de cliques/mudanças e boot()
  vendor/                   ← supabase-js, jsPDF, autotable, fontes do PDF
  arsenal/                  ← material de vendas BeSmart (página independente)
supabase/
  migrations/0001..0005     ← fonte da verdade do banco (incrementais, idempotentes)
  schema.sql                ← GERADO: todas as migrations num arquivo (npm run schema)
tests/
  unit/                     ← node:test (motor, validação)
  db/                       ← stub do Supabase + verificações de RLS em SQL
  e2e/                      ← Playwright + Supabase falso em memória
scripts/                    ← servidor local, lint, gerador de schema/ícones, teste de banco
docs/                       ← esta documentação
```

## 3. Modelo de dados

Tabelas de registro (`leads`, `clientes`, `contratos`, `vidas`, `tarefas`,
`despesas`): `id text PK`, `dono uuid → auth.users (restrict)`, `dados jsonb`,
`versao int`, `atualizado_em`, `atualizado_por`.

| Entidade | Campos principais em `dados` | Relações |
|---|---|---|
| Lead | nome, empresa, telefone, email, etapa, pilar, valorEstimado, previsaoFechamento, origem, temperatura, responsavel, historico[], comissoesPrevistas[], motivoPerda | → cliente (clienteId) ao ganhar |
| Cliente | nome, tipo (PF/PJ), doc, telefone, whatsapp, email, nascimento, endereço, responsavel, origem, etapaCliente, ultimoPosVenda, contato principal (PJ) | ← contratos, vidas, documentos |
| Contrato | clienteId, pilar, produto, operadora, numero/apolice/grupo/cota, status, valorBase, valorTotal, inicio, fim, corretor, splitPct, impostoPct, regraId, **comissoes[]** (n, tipo, pct, valor, vence, status, recebidoEm, valorRecebido) | → cliente; ← vidas |
| Vida | nome, doc, nascimento, tipo, parentesco, contratoId, status, entrada, saida | → contrato (dono segue o contrato) |
| Tarefa | titulo, tipo, vence, status, responsavel, refTipo/refId/refNome, adiada, auto, chaveAuto | → cliente/lead |
| Despesa | data, categoria, valor, forma, recorrente | só gestor |

Outras tabelas: `perfis` (papel, status, ver_tudo, meta, split_pct), `config`
(uma linha: réguas, etapas, listas, parâmetros), `atividade` (trilha legível,
só inclusão), `auditoria` (trilha do servidor), `erros_app`, `documentos`.

## 4. Permissões (RBAC)

| Papel | Carteira | Comissão | Exclui cliente/contrato | Split/imposto | Despesas | Config/Equipe | Auditoria/Lixeira |
|---|---|---|---|---|---|---|---|
| Gestor | tudo | total | sim | define | sim | sim | sim |
| Corretor | a própria | a sua parte (tela) | não | não | não | não | não |
| Corretor com alcance | tudo | total | não | define | não | não | não |
| Assistente | tudo | não vê (tela) | não | não | não | não | não |
| Pendente / bloqueado | nada | — | — | — | — | — | — |

Onde vale: **banco** (RLS + gatilhos `proteger_perfil`, `proteger_contrato`) e
tela (`podeVer`, `veCorretora`, `podeExcluirCarteira`). Funções:
`sou_ativo()`, `sou_gestor()`, `vejo_tudo()`, `vejo_corretora()`,
`posso_ver_cliente()`. Regras financeiras para quem não vê o lado da corretora:
não altera split/imposto (o banco mantém o valor), não desfaz/altera/apaga
parcela recebida, só recebe pelo valor previsto, não cria contrato já recebido.

Limite conhecido: a leitura do valor cheio pela API (ver AUDITORIA A9).

## 5. Fluxos críticos

- **Entrada:** `boot()` → sessão → `carregarTudo()` (9 leituras paralelas,
  paginadas de 1.000 em 1.000) → `ligarTempoReal()`.
- **Gravação:** `salvar()` atualiza a tela na hora, grava com a `versao`
  conhecida, e em falha desfaz na tela (`desfazerNaTela`) e explica o motivo
  (`falhaEscrita`). Trilha legível em `atividade`; trilha oficial por gatilho.
- **Tempo real:** evento → `aplicarMudanca()` (ignora eco mais antigo que a
  versão conhecida) → `agendarRender()`.
- **CRM:** Lead (novo → contato → qualificado → proposta → negociação) →
  ganho converte em cliente + contrato (régua gera o cronograma) → contrato
  proposta → implantado (gera tarefa de pós-implantação) → ativo → renovação
  (tarefa automática 45 dias antes) → pós-venda (cadência, aniversários,
  reajuste ANS). A esteira de relacionamento do cliente tem Implantação,
  Documentação pendente, Ativo, Renovação, Em risco, Encerrado.
- **Documentos:** upload para `documentos/clientes/<id>/...` → registro em
  `documentos` → abertura por link de 60 s.

## 6. Automações (cada uma com motivo operacional)

| Automação | Onde | Por quê |
|---|---|---|
| Tarefa de pós-implantação (15 dias) | gatilho em `contratos` | Primeiro boleto e carteirinhas são a maior causa de cancelamento precoce. |
| Follow-up de proposta parada (7+ dias sem alteração) | `gerar_tarefas_automaticas()` | Proposta esquecida é venda perdida. |
| Preparar renovação (45 dias antes do fim) | idem | Reajuste negociado com antecedência retém o cliente. |
| Lembretes (tarefas, aniversário, boleto, faixa ANS, reajuste, comissão atrasada, cobrança por operadora) | tela | Já existiam; mantidos. |

Tarefas automáticas têm chave única (`chaveAuto`): rodar de novo não duplica.

## 7. Erros e observabilidade

- `window.onerror`/`unhandledrejection` → mensagem simples + registro técnico.
- Registro: console estruturado e tabela `erros_app` (quando, quem, tela,
  operação, mensagem, pilha, versão, navegador) — no máximo 20 por sessão, sem
  dado de cliente, só o gestor lê, limpeza de 180 dias (`limpar_erros_antigos()`).
- `auditoria`: quem/quando/o quê/antes/depois/origem de toda alteração.

## 8. Segurança

- CSP: `script-src 'self'`; `connect-src` só `*.supabase.co`; `object-src 'none'`.
- Cabeçalhos: HSTS, `X-Frame-Options: DENY`, `nosniff`, COOP, `Permissions-Policy`.
- Nenhum segredo no front-end: apenas a chave `anon`. `service_role` nunca.
- Bibliotecas servidas do próprio domínio; jsPDF com SRI.
- Documentos em bucket privado, link temporário, mesma regra da carteira.

## 9. Preparado para integrações

Sem integrações fictícias. O que já existe para recebê-las:

- **Fonte de eventos:** `auditoria` tem id crescente, tabela, registro, ação e
  diferença. Uma Edge Function (WhatsApp, e-mail, webhooks, ERP) lê a partir
  do último id processado e reage (ex.: "contrato passou a implantado").
- **Gatilhos de domínio** (`automacao_contrato`) mostram o padrão para novas
  reações no banco.
- **Segredos** de integrações ficam nas variáveis das Edge Functions, nunca no
  `config.js`.
- **Documentos** já no Storage: assinatura eletrônica e envio por e-mail
  trabalham sobre o mesmo caminho.
