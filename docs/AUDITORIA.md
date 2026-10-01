# Auditoria técnica — Erbe · Central

Data: 01/10/2026 · Base auditada: pacote `erbe-central` (versão de 29/09/2026) +
repositório `besmart`.

Este documento registra o que foi encontrado, a gravidade, e o que foi feito.
**Status:** ✅ corrigido e testado · 🟡 mitigado (parcial) · ⏳ planejado (ver
[ROADMAP.md](ROADMAP.md)).

---

## 1. O que existia

| Camada | Situação encontrada |
|---|---|
| Front-end | Uma única página de 556 KB: HTML + CSS + ~6.900 linhas de JavaScript sem build, fontes em base64, tudo inline. Bem escrito e comentado, com boas decisões de domínio (motor de comissão, vidas, faixa ANS, previsão). |
| Banco | Supabase/PostgreSQL. Tabelas `perfis`, `leads`, `clientes`, `contratos`, `vidas`, `tarefas`, `despesas`, `config`, `atividade`. Cada registro guarda o objeto inteiro em `dados` (jsonb) e repete em coluna só o `dono` (para a RLS). |
| Acesso | Login por e-mail (senha ou link). Papéis `gestor`, `corretor`, `assistente` + "alcance" (`ver_tudo`). Usuário novo entra pendente. |
| Hospedagem | Netlify, site estático, `config.js` com URL e chave **anon** (pública por definição — correto). |
| Repositório `besmart` | Continha apenas o "Arsenal de vendas" BeSmart (página estática de conteúdo comercial), sem relação de código com o CRM. Foi preservado em `/arsenal/`. |

Pontos fortes que foram **preservados**: modelo flexível em jsonb (não houve
migração destrutiva), motor de comissionamento, trilha de alterações legível,
exportação Excel/PDF sem dependência de servidor, identidade visual da marca.

---

## 2. Problemas encontrados

### Críticos

| # | Problema | Impacto | Status |
|---|---|---|---|
| C1 | **Carteira acima de 1.000 registros sumia em silêncio.** O app lia cada tabela com um único `select *`; o PostgREST do Supabase devolve no máximo 1.000 linhas por pedido. | Com mais de 1.000 clientes/contratos/vidas, parte da carteira não aparecia: painéis, comissões, relatórios e a trava de CPF duplicado ficavam errados sem nenhum aviso. | ✅ Leitura paginada (`range`) de todas as tabelas. Teste E2E com 1.503 clientes. |
| C2 | **Regras de permissão só na tela.** Pela API (chave pública + login), o corretor conseguia: excluir clientes e contratos próprios; aumentar o próprio split no contrato; desfazer, alterar ou apagar parcela de comissão já recebida; "receber" valor maior que o previsto. | Fraude ou erro irreversível em dado financeiro, sem rastro confiável. | ✅ Migration 0002: exclusão só pelo gestor; gatilho `proteger_contrato` com as regras financeiras (vale também para upsert). 98 verificações em PostgreSQL real. |
| C3 | **Apagar um usuário apagava a carteira dele.** `dono ... on delete cascade` em todas as tabelas. | Remover um corretor no painel do Supabase levava junto clientes, contratos, vidas e tarefas, sem volta. | ✅ `on delete restrict` + função `transferir_carteira()` e botão em Equipe. |
| C4 | **Auditoria gravada pelo navegador e apagável.** A trilha `atividade` era escrita pelo próprio app (podia ser pulada por quem usa a API) e o gestor podia apagá-la. | Sem trilha confiável de quem mudou valor, situação ou permissão. | ✅ Tabela `auditoria` gravada por gatilho no banco (antes/depois campo a campo; registro inteiro na exclusão); ninguém edita nem apaga pela API; `atividade` virou só-inclusão. |
| C5 | **Cada clique recarregava tudo para todo mundo.** Qualquer alteração de qualquer usuário disparava, em todos os navegadores abertos, a releitura das 9 tabelas inteiras. | Custo e lentidão crescendo com o quadrado da equipe × carteira; com 10 pessoas e milhares de registros, o Supabase passaria a ser o gargalo. | ✅ Tempo real aplica a mudança recebida no estado; relê só ao reconectar. Teste E2E prova zero leituras extras. |

### Altos

| # | Problema | Status |
|---|---|---|
| A1 | Edição simultânea: duas pessoas no mesmo registro → a última gravação apagava a outra sem aviso. | ✅ Coluna `versao` + gatilho (0004); o app avisa e mostra a versão atual sem perder o que foi digitado. Compatível com app em cache. |
| A2 | Falha ao salvar deixava a tela mostrando um dado que não estava gravado (atualização otimista sem desfazer); exclusão filtrada pela RLS "sumia" só na tela. | ✅ Desfaz na tela e explica o motivo; exclusão confere o que foi apagado. |
| A3 | RLS lenta: funções de permissão avaliadas linha a linha. | ✅ Políticas com `(select fn())`: 100 mil contratos de **1,3 s → 12 ms**. |
| A4 | CPF/CNPJ duplicado entre carteiras: a trava só olhava o que o usuário via (a RLS esconde o cliente do colega). | ✅ `cliente_por_documento()` responde se existe e de quem é, sem expor os dados. |
| A5 | CNPJ alfanumérico (Receita, julho/2026) quebrava a normalização (letras eram descartadas). | ✅ Validação e normalização com letras no app e no banco (exemplo oficial `12.ABC.345/01DE-35` testado). |
| A6 | Logo SVG de Configurações inserido como HTML (`innerHTML`): um SVG com script executaria para todos os usuários. | ✅ SVG personalizado é exibido como imagem (não executa nada). Teste E2E. |
| A7 | Sem Content-Security-Policy; supabase-js e jsPDF carregados de CDN de terceiros. | ✅ CSP estrita (só script do próprio site, conexão só com `*.supabase.co`), bibliotecas servidas de `vendor/` com SRI, HSTS, `X-Frame-Options: DENY`. |
| A8 | Nenhum teste automatizado. | ✅ 13 unitários, 38 E2E (desktop, celular, acessibilidade, CSP, PWA), 98 verificações de banco, CI no GitHub Actions. |
| A9 | Corretor/assistente conseguem **ler** o valor cheio da comissão e o split pela API (o valor viaja dentro do contrato). Já documentado no LEIA-ME original. | ⏳ Exige separar o cronograma de comissão em tabela própria com visão por papel. Projeto descrito no ROADMAP (fase 1). |

### Médios

| # | Problema | Status |
|---|---|---|
| M1 | Erro de JavaScript em uma tela derrubava a tela inteira, sem registro. | ✅ Tratamento global, tela de erro amigável, registro técnico em `erros_app` (0003). |
| M2 | Arquivo único de 556 KB: difícil de manter, sem cache por partes. | ✅ 36 módulos por domínio, CSS e fontes em arquivos, lint entre módulos. |
| M3 | Item ativo do menu nunca ficava destacado (`montarNav` sobrescrevia `aria-current`). | ✅ |
| M4 | Modal roubava o foco 40 ms depois de abrir (texto ia para o campo errado); Enter na busca usava resultado anterior. | ✅ |
| M5 | Celular: ~330 px de cabeçalho antes do conteúdo, menu horizontal escondido, tabelas com rolagem lateral, modal pequeno. | ✅ Barra de atalhos, menu em gaveta, tabelas em cartões, modal em tela cheia. |
| M6 | Contraste abaixo de WCAG AA no texto secundário, chips e botões (tema escuro). | ✅ Tokens de cor ajustados; axe-core sem violação grave. |
| M7 | Formulários sem validação de CPF/CNPJ, e-mail, telefone; sem máscara; clique duplo duplicava registro. | ✅ |
| M8 | Conversão de lead seguia gravando o contrato mesmo se o cliente falhasse (contrato órfão). | ✅ Para na primeira falha. |
| M9 | Painel fixo no mês corrente, sem filtro por corretor/pilar/operadora. | ✅ Período livre e filtros; produção por pilar/operadora/produto. |
| M10 | Sem documentos de cliente. | ✅ Bucket privado + RLS + links temporários (0005). |
| M11 | Importação de backup: uma requisição por registro. | ✅ Lotes de 500. |
| M12 | Sem busca global. | ✅ Ctrl+K com CPF/CNPJ, telefone, proposta, apólice, vidas. |

### Baixos

| # | Problema | Status |
|---|---|---|
| B1 | Código morto do ambiente de artifact (`window.claude.use`), função `resumoRegra` sem uso. | ✅ Removidos. |
| B2 | Sistema interno indexável por buscadores. | ✅ `noindex` + `robots.txt`. |
| B3 | Regra de imposto/split dentro de arquivo de tela. | ✅ Movida para o motor. |
| B4 | `README` recomenda desligar "Confirm email" e aceita senha de 6 caracteres. | 🟡 Usuário novo continua pendente (não vê nada), então o risco é baixo; recomendação de SMTP próprio + confirmação + senha ≥ 8 em [OPERACAO.md](OPERACAO.md). |
| B5 | Sem PWA (instalação no celular). | ✅ Manifesto, ícones da marca, service worker que não guarda dado de cliente. |

---

## 3. Verificação

| Verificação | Resultado |
|---|---|
| `npm run lint` (36 módulos concatenados, `no-undef`/`no-redeclare` entre arquivos) | 0 erros, 0 avisos |
| `npm run test:unit` (motor de comissão, validação, datas ANS) | 13/13 |
| `npm run test:db` (migrations aplicadas 2× + RLS em PostgreSQL 16) | 98/98 |
| `npm run test:e2e` (Chromium desktop e celular) | 38/38 |
| axe-core WCAG 2 A/AA, violações graves | 0 (claro e escuro) |
| CSP: violações ao navegar e gerar PDF | 0 |

## 4. O que precisa de decisão sua

1. **Aplicar as migrations no Supabase** (passo a passo em [OPERACAO.md](OPERACAO.md)).
   Nenhuma apaga dado; todas podem ser rodadas de novo.
2. **Esconder do corretor o lado da corretora também na API** (A9) — muda como
   o cronograma de comissão é guardado. Recomendo fazer (fase 1 do roadmap).
3. **IA** — onde agrega e quanto custa está em [ROADMAP.md](ROADMAP.md); não foi
   ativado nada que gere custo sem sua aprovação.
4. **Publicação**: este repositório passa a publicar o CRM na raiz e o Arsenal
   BeSmart em `/arsenal/`. Se o site Netlify ligado ao repositório `besmart`
   hoje serve o Arsenal na raiz, confirme antes de juntar na `main`.
