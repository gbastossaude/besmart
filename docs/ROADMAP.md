# Roadmap — próximas fases

Ordem por impacto. Cada fase é incremental: nada exige reconstruir o sistema.

## Fase 1 — Comissão protegida também na leitura (recomendado)
**Problema:** quem não vê o lado da corretora (corretor sem alcance,
assistente) ainda consegue *ler* pela API o valor cheio do cronograma e o split,
porque eles viajam dentro de `contratos.dados`. A tela esconde; o banco não.
**Proposta:**
1. Tabela `comissoes` (uma linha por parcela: contrato_id, tipo, vence, valor,
   status, recebido_em, valor_recebido, imposto_pct) com RLS: só gestor e
   corretor com alcance leem diretamente.
2. View `minhas_comissoes` (security barrier) que devolve ao corretor apenas
   `valor × split` das parcelas dos contratos dele; assistente não lê nada.
3. Migração de dados idempotente a partir de `dados->'comissoes'`; período de
   convivência em que o app lê das duas fontes; depois o array sai do contrato.
4. `proteger_contrato` passa a valer sobre a tabela nova (mais simples).
**Esforço:** médio (motor e telas de comissão). **Risco:** controlado com os testes atuais.

## Fase 2 — Escala acima de ~50 mil contratos
- Agregações do painel/relatórios em funções SQL (`painel_resumo(periodo, filtros)`)
  e views materializadas atualizadas por pg_cron.
- Listas com paginação no servidor (keyset) e busca por `pg_trgm`
  (`clientes_busca_idx` sobre nome/documento/telefone normalizados).
- Carga inicial só do que a tela usa; o resto sob demanda.

## Fase 3 — RBAC por módulo e ação
Hoje: 3 papéis + alcance, aplicados no banco. Se a equipe crescer com funções
distintas (Financeiro, Operacional/implantação, Suporte, Head de equipe):
tabela `papeis_permissoes(papel, modulo, acao)` (ver, criar, editar, excluir,
exportar, administrar), função `pode(modulo, acao)` usada nas políticas e na
tela, e equipes (`equipes`, `perfis.equipe_id`) para o papel Head ver a
produção do time. **Precisa da sua definição de papéis** — não criei papéis que
não existem na operação.

## Fase 4 — Integrações (sem nada fictício até haver contrato/conta)
Padrão: Edge Function + segredos no Supabase + leitura de eventos da tabela
`auditoria` a partir do último id processado (tabela `integracoes_cursor`).
- **WhatsApp Business (Cloud API):** lembrete de boleto, parabéns, aviso de
  reajuste — hoje o sistema já monta a mensagem e abre o `wa.me`.
- **E-mail transacional:** proposta enviada, documentos pendentes.
- **Assinatura eletrônica** (Clicksign, D4Sign, Docusign) sobre os documentos do Storage.
- **Operadoras/seguradoras:** importação de extrato de comissão (CSV/OFX) para
  conciliação automática — maior ganho operacional imediato.
- **Calendário** (Google/Microsoft) para a agenda.

## Fase 5 — IA onde há ganho real (exige aprovação de custo)
Via Edge Function chamando a API do Claude (chave só no servidor; custo por uso,
estimável por volume). Candidatos, em ordem de retorno:
1. **Leitura de extrato de comissão em PDF** → parcelas conciliadas
   automaticamente (horas de digitação por mês).
2. **Resumo do cliente** antes de uma ligação (produtos, últimos contatos,
   pendências, oportunidades de cross-sell).
3. **Rascunho de mensagem** de follow-up/renovação no tom da corretora.
4. **Classificação de documentos** enviados (RG, comprovante, proposta).
Não recomendado agora: chatbot genérico, "score" de lead sem histórico suficiente.

## Fase 6 — Qualidade contínua
- Tipagem gradual: `// @ts-check` + JSDoc nos módulos de domínio (`motor.js`,
  `dados.js`, `validacao.js`) e `tsc --noEmit` no CI.
- Teste E2E contra um projeto Supabase de homologação (além do Supabase falso).
- Monitor de erros: painel simples de `erros_app` dentro de Configurações.
