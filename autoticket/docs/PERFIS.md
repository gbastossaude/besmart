# Perfis de site (adapters)

Um **perfil** descreve um site: como reconhecer cada página, quais elementos representam setores,
quantidade e o botão "adicionar ao carrinho". O núcleo do robô não conhece nenhum site — quando o
site mudar a interface, **atualize o perfil**, não o código.

* Perfis embutidos: `src/site/profiles/*.json` (os domínios do `manifest.json` são gerados deles).
* Perfis personalizados: *Opções › Perfis de site › Editor de perfil*. Um perfil personalizado com
  o mesmo `id` de um embutido o substitui.

## Formato

```jsonc
{
  "id": "meu-site",                 // [a-z0-9-], único
  "name": "Meu site",
  "version": 1,                      // incremente ao atualizar
  "verified": false,                 // true depois de validar no site real
  "hosts": ["exemplo.com.br"],       // casa também com subdomínios (www., ingressos., ...)

  // Regras de URL por tipo de página. Texto = "contém" (sem diferenciar maiúsculas);
  // "re:<regex>" = expressão regular. Se duas regras casarem, vence a mais longa.
  "pages": {
    "eventList": ["/eventos"],
    "event": ["/evento/"],
    "cart": ["/carrinho"],
    "checkout": ["/checkout"],
    "login": ["/login"],
    "success": ["/pedido/confirmado"],
    "queue": ["/fila"],
    "blocked": ["/blocked"]
  },

  // Sinais de DOM (opcionais). Cada item é uma lista de seletores (principal → fallbacks).
  "dom": {
    "loading":    [{ "css": ".spinner" }],
    "cartFilled": [{ "css": ".cart-badge", "text": ["1", "2"] }],   // já há item no carrinho
    "challenge":  [{ "css": ".meu-captcha" }],
    "queue":      [{ "css": ".fila-virtual" }],
    "error":      [{ "css": ".erro-servidor" }]
  },

  // Textos (normalizados: sem acento, minúsculas)
  "texts": {
    "soldOut": ["esgotado"],
    "actionFailed": ["limite atingido", "nao foi possivel"],   // rejeição após clicar em adicionar
    "cartConfirmed": ["adicionado ao carrinho"]
  },

  // Lista de eventos (opcional): cartões e link a clicar, casados com "Palavras-chave do evento"
  "eventList": { "items": [{ "css": ".card-evento" }], "clickTarget": "a" },

  // Passos na página do evento, em ordem
  "steps": [
    { "id": "abrir", "kind": "click", "label": "Botão Ingressos", "optional": true, "timeoutMs": 3000,
      "target": [{ "css": "button", "text": ["ingressos"] }] },
    { "id": "setor", "kind": "pick", "label": "Setor", "source": "sectors", "probe": true,
      "items": [{ "css": ".setor" }, { "css": "[data-sector]" }], "textIn": ".nome" },
    { "id": "tipo", "kind": "pick", "label": "Tipo", "source": "categories", "optional": true,
      "items": [{ "css": ".tipo-ingresso" }] },
    { "id": "qtd", "kind": "quantity", "label": "Quantidade", "scope": "picked",
      "input": [{ "css": "select.qtd" }], "increment": [{ "css": "button.mais" }] },
    { "id": "add", "kind": "click", "label": "Adicionar ao carrinho", "critical": true,
      "target": [{ "css": "button", "text": ["adicionar ao carrinho"] }] }
  ],

  // Botão do carrinho para abrir o checkout (o pagamento é sempre do usuário)
  "cart": { "proceed": [{ "css": "button", "text": ["finalizar compra"] }] }
}
```

### Seletor (`Sel`)

| Campo     | Significado |
|-----------|-------------|
| `css`     | Seletor CSS. Prefira atributos estáveis (`data-*`, `name`, `aria-*`) a classes geradas. |
| `text`    | O texto do elemento deve conter algum destes termos. Combina CSS genérico (`button`) com texto estável. |
| `textIn`  | Ler o texto de um elemento interno (ex.: `h5` dentro do cartão). |
| `visible` | `false` para aceitar elementos ocultos (padrão: só visíveis). |

A lista é tentada em ordem; quando um **fallback** é usado, o log mostra um aviso — sinal de que o
seletor principal precisa ser atualizado.

### Passos (`steps`)

| `kind`     | O que faz |
|------------|-----------|
| `pick`     | Lista os itens, descarta esgotados/desabilitados, ordena pela **sua** lista de preferências (`source`: `sectors`, `categories`, `events` ou `any`) e clica no melhor. `probe: true` marca o passo usado para verificar disponibilidade. |
| `quantity` | Ajusta a quantidade via `select`/`input` (respeitando o máximo do site) ou clicando em "+". |
| `click`    | Clica num botão. `critical: true` (apenas um por perfil) = ação protegida pelo ledger de idempotência: nunca é repetida sem confirmação de falha. |
| `wait`     | Aguarda um elemento aparecer. |

Passos **antes** do `probe` são "abridores" (ex.: botão que exibe a lista): só rodam quando a lista
ainda não está visível, uma vez por carregamento de página.

`optional: true` → se o elemento não aparecer no tempo, o passo é pulado.

## Como adaptar a um site (ou a uma mudança de interface)

1. Abra a página do evento no Chrome.
2. Popup › **Testar seletores**: mostra o tipo de página detectado, quantos elementos cada passo
   encontrou, se usou o seletor principal ou um fallback, e os candidatos (✓ disponível / ✗ esgotado).
   Os elementos ficam destacados por 8 s. **Nada é clicado.**
3. Ajuste o JSON no editor (*Opções › Perfis*) usando o DevTools (F12) para achar seletores estáveis.
4. Rode em **modo Simulação**: o robô executa tudo, exceto "adicionar ao carrinho" e checkout, e
   destaca o botão que clicaria.
5. Quando estiver correto, marque `"verified": true` e incremente `version`.

## Regras para perfis

Perfis só descrevem **interações que você faria pela interface**. Não use perfis para clicar em
CAPTCHA, sair/entrar em filas, aceitar termos em seu nome ou preencher dados de terceiros — o robô
detecta esses mecanismos e para antes de agir sobre eles.
