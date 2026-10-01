# Camada de site (adapters)

O núcleo (`src/core`) não conhece nenhum site. Tudo que é específico fica aqui:

| Pasta/arquivo        | Papel                                                                 |
| -------------------- | --------------------------------------------------------------------- |
| `types.ts`           | Contrato `SiteProfile` (URLs, sinais de DOM/texto, passos de seleção) |
| `detectors.ts`       | Classifica a página (evento, carrinho, fila, CAPTCHA, erro…)          |
| `selectors.ts`       | Resolve seletores com fallback e ranqueia candidatos por preferência  |
| `actions.ts`         | Clique, quantidade, leitura de mensagens de feedback                  |
| `flows.ts`           | `Runner`: o fluxo orientado a eventos dentro da aba                   |
| `profiles/*.json`    | Perfis embutidos — atualize aqui quando o site mudar                  |

Veja `docs/PERFIS.md` para o formato completo e como validar com o modo Simulação.
