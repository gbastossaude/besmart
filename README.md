# Erbe · Central

Sistema de gestão da **Erbe Proteção e Patrimônio** — corretora de planos de
saúde, seguros e consórcios. Funil de leads, carteira de clientes, contratos,
vidas e cotas, comissionamento com previsão, renovações, agenda, despesas,
relatórios em Excel/PDF, documentos, busca global e auditoria.

**Stack:** site estático no Netlify (`public/`) + Supabase (PostgreSQL com RLS,
Auth, Realtime, Storage). Sem build.

| Documento | Para quê |
|---|---|
| [docs/OPERACAO.md](docs/OPERACAO.md) | Publicar, aplicar as migrations, rotinas, custos, desenvolvimento |
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | Como o sistema é organizado, modelo de dados, permissões, fluxos |
| [docs/AUDITORIA.md](docs/AUDITORIA.md) | O que foi encontrado na auditoria técnica e o que foi corrigido |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Próximas fases, em ordem de impacto |
| [docs/historico/](docs/historico/) | LEIA-ME da versão anterior (guia de uso das funções) |

## Começo rápido

```bash
npm install
npm run dev           # http://localhost:4173
npm run check         # lint + schema em dia + unitários + E2E
npm run test:db       # migrations + RLS num PostgreSQL descartável
```

Banco: cole `supabase/schema.sql` no SQL Editor do Supabase (idempotente, não
apaga dados). Fonte da verdade: `supabase/migrations/`.

Também publicado neste site: `/arsenal/` — material de vendas BeSmart (página independente).
