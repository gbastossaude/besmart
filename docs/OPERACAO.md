# Operação — publicar, atualizar o banco e manter

## 1. Atualizar um sistema que já está no ar (passo a passo)

> Ordem importa: **primeiro o banco, depois o site.** O site novo funciona com
> o banco antigo (os recursos novos ficam desligados e avisam), mas as regras de
> segurança só passam a valer depois das migrations.

1. **Backup.** Supabase → Database → Backups (ou Configurações → Baixar backup
   no próprio sistema).
2. **Banco.** Supabase → SQL Editor → New query → cole `supabase/schema.sql`
   inteiro → Run. É o conjunto das migrations `0001`…`0005`; todas são
   idempotentes e **nenhuma apaga dado**. (Quem prefere aplicar uma a uma: rode
   os arquivos de `supabase/migrations/` em ordem numérica.)
3. **Conferir** (SQL Editor):
   ```sql
   select papel, status, email from perfis order by papel;            -- você continua gestor ativo
   select count(*) from auditoria;                                    -- tabela existe
   select id, public from storage.buckets where id = 'documentos';     -- public = false
   ```
4. **Site.** Netlify → o site já ligado ao repositório publica sozinho a pasta
   `public/` (definido no `netlify.toml`). Publicação manual: arraste a pasta
   **`public/`** inteira.
5. **Testar no navegador:** entrar, abrir Clientes, Ctrl+K, abrir um cliente e
   anexar um PDF de teste, conferir Atividade → Lixeira (gestor).

### Automações diárias (opcional, recomendado)
Supabase → Database → Extensions → ative **pg_cron** → rode o `schema.sql` de
novo. A rotina `gerar_tarefas_automaticas()` passa a rodar todo dia às 7h
(Brasília). Sem o pg_cron, use o botão **Configurações → Rodar automações agora**.

## 2. Primeira instalação (projeto novo)

1. supabase.com → novo projeto, região **South America (São Paulo)**.
2. SQL Editor → `supabase/schema.sql` → Run.
3. Authentication → Providers → Email: ligado. Authentication → URL
   Configuration: Site URL = endereço do Netlify; Redirect URLs = mesmo endereço + `/*`.
4. Settings → API: copie **Project URL** e a chave **anon/publishable** para
   `public/config.js`. **Nunca** use a `service_role`/secret.
5. Netlify → Import from Git (este repositório). Não há build; `netlify.toml`
   já aponta `publish = "public"`.
6. Entre com o e-mail master (`email_master()` no schema): ele nasce gestor.

## 3. Configurações recomendadas de autenticação

| Item | Recomendação | Motivo |
|---|---|---|
| SMTP próprio (Resend, Brevo, SendGrid) | Ligar | O servidor de e-mail do Supabase é limitado a poucos envios/hora. |
| Confirm email | Ligar depois do SMTP | Garante que o e-mail é de quem se cadastrou. |
| Senha mínima | 8+ caracteres (Auth → Policies) | A tela aceita 6; o Supabase pode exigir mais. |
| Leaked password protection | Ligar (plano Pro) | Bloqueia senhas vazadas. |

Usuário novo continua **pendente** (não vê nada) até o gestor liberar em Equipe.

## 4. Variáveis e segredos

| Onde | O quê | Sigilo |
|---|---|---|
| `public/config.js` | URL do projeto e chave anon | Pública por definição (a RLS protege). |
| Supabase → Edge Functions → Secrets | chaves de integrações futuras (WhatsApp, e-mail, IA) | Secretas. Nunca no front-end. |
| `index.html` → CSP `connect-src` | `*.supabase.co` | Se usar domínio próprio no Supabase, acrescente-o. |

## 5. Rotinas de manutenção

```sql
-- Erros recentes do aplicativo (gestor, ou SQL Editor)
select quando, pagina, operacao, mensagem, versao from erros_app order by quando desc limit 50;

-- Quem mudou o quê num contrato
select quando, quem, acao, mudancas from auditoria
 where tabela = 'contratos' and registro_id = 'ctr-...' order by quando desc;

-- Excluídos nos últimos 30 dias (também na tela: Atividade → Lixeira)
select quando, tabela, registro_id, registro->>'nome' from auditoria
 where acao = 'DELETE' and quando > now() - interval '30 days' order by quando desc;

-- Limpar erros técnicos com mais de 180 dias
select public.limpar_erros_antigos();
```

**Remover alguém da equipe:** Equipe → *Transferir carteira* para outra pessoa →
Editar → Situação *bloqueado*. Só então, se quiser, apague o usuário em
Authentication (o banco impede apagar quem ainda tem carteira).

## 6. Desenvolvimento

```bash
npm install
npm run dev          # http://localhost:4173 (mesmos cabeçalhos/CSP do Netlify)
npm run lint         # lint entre os módulos do front-end
npm run test:unit    # motor de comissão, validação
npm run test:db      # PostgreSQL descartável + RLS (precisa do PostgreSQL instalado)
npm run test:e2e     # Playwright (Supabase falso em memória)
npm run schema       # regenera supabase/schema.sql a partir das migrations
```

Regras para mudar o banco: crie `supabase/migrations/NNNN_descricao.sql`
**incremental e idempotente** (`if not exists`, `create or replace`, `drop ... if
exists` antes de recriar política), acrescente verificações em
`tests/db/01-permissoes.test.sql`, rode `npm run schema` e `npm run test:db`.
Nunca apague coluna/tabela sem migração de dados e aprovação.

Ao publicar código novo, troque `VERSAO` em `public/sw.js` e `APP_VERSAO` em
`public/assets/js/erros.js` (ajuda a separar erros por versão).

## 7. Custos (Supabase + Netlify)

- Leituras: a carteira é lida uma vez ao abrir e depois só chegam diferenças
  pelo tempo real (antes: releitura completa a cada alteração de qualquer pessoa).
- Banco: a auditoria guarda **só a diferença** de cada alteração (o cronograma
  de comissão registra apenas a parcela que mudou), e o registro inteiro só na
  exclusão. `erros_app` é limitada por sessão e por tamanho.
- Storage: limite de 20 MB por arquivo e tipos permitidos no bucket.
- Netlify: site estático; código revalidado (304) e bibliotecas em cache.
