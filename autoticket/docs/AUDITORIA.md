# Auditoria da versão 6 ("Auto Ticket", `AutoTicket_User.zip`)

Data: 2026-10-01 · Escopo: todo o pacote enviado (manifest, `js/background.js`, `js/run.js`,
`js/pow_worker.js`, `app.html`, `rules.json`, pasta `Overwritter/`, `_locales/`, assets).

O código de `background.js` e `run.js` estava minificado; foi formatado (~1.500 e ~8.000 linhas)
para leitura. Nenhum arquivo da v6 foi copiado para a v7 além do ícone e do som de alerta.

---

## 1. Arquitetura encontrada

```
popup (app.html + run.js)  ─┐
                            ├─ chrome.runtime.sendMessage ──►  background.js (service worker)
content script (run.js) ────┘   (≈30 tipos de mensagem,          │
  injetado em TODA página http/https                              ├─ API remota imrichbotbuyer.pro (login, licença,
  e TODOS os iframes, com jQuery                                  │    configuração "page_bot", WhatsApp)
                                                                   ├─ api.ocr.space (OCR de CAPTCHA, chave fixa)
                                                                   └─ webRequest em <all_urls> (log de headers/corpos)
```

* **Configuração** ("page_bot": setores, URLs de cada etapa, intervalos) vinha do servidor remoto
  após login com e-mail/senha. Sem o servidor a extensão não funcionava.
* **Estado** ficava em dezenas de variáveis globais (`stopgeral`, `isProcessing`, `can_refresh`,
  `running_clicks`, `__tk_in_cart`, `play_status` numérico 1–5…), sem máquina de estados.
* **Fluxo por site** era um `switch` gigante (`page_action`, ~3.200 linhas) com um bloco por domínio.

### Fluxo real (v6)

```
página carrega (qualquer site) → run.js verifica lista de domínios
  → pede "page_bot" ao background → background consulta API remota
  → can_run() a cada ciclo: horário de trabalho? erro? login? home? evento? carrinho?
  → page_action(): bloco do site
       ├─ modo API (Eleven Tickets/Palmeiras/Flamengo): chamadas diretas às APIs internas,
       │   resolução de Proof-of-Work, reserva em loop a cada ~1,1s
       └─ modo interface: cliques por texto (jQuery), laços while+sleep(50ms)
  → carrinho: alerta sonoro, "keep alive" do carrinho, notificação WhatsApp com QR do PIX
  → checkout (alguns sites): escolhe PIX, aceita termos e clica "Finalizar compra"
```

---

## 2. Problemas encontrados (priorizados)

### P0 — Contorno de proteções / fraude (removidos integralmente)

Contrariam diretamente as regras da missão ("não burlar CAPTCHA, fila, autenticação, limites,
antifraude") e expõem o usuário a bloqueio de conta e risco jurídico.

| # | Onde (v6) | O que fazia |
|---|-----------|-------------|
| 1 | `run.js` `createlogin`, `createaddress`, `gerarCPFValido`, `getRandomName`, `getRandomCepByUF` | Criava contas automaticamente com **CPF, nome, e-mail, telefone e endereço gerados**, senha fixa (`Jacare98@`) — contas falsas para driblar limite por CPF. |
| 2 | `background.js` `portadores_estudante` / `portadores_idoso`; `run.js` `gerarDataNascimentoAleatoria(66,85)`, `gerarEscolaAleatoria` | Preenchia "portadores" de **meia-entrada** (estudante/idoso) com dados fictícios e **CPFs de terceiros embutidos no código**. |
| 3 | `run.js` (FIFA/`#form_captcha`) + `background.js` `ocr_request` | Resolvia CAPTCHA por OCR (api.ocr.space, chave fixa). |
| 4 | `run.js` `click_element(iframe[title="reCAPTCHA"])`; pasta `Overwritter/recaptcha-helper.js` | Clicava no reCAPTCHA; substitutos do script de reCAPTCHA do site (não referenciados no manifest — código morto, mas de propósito evidente). |
| 5 | `pow_worker.js`, `enable_pow_worker`, bloco Eleven Tickets | Resolvia o **Proof-of-Work antibot** e fazia reservas por **chamadas diretas** às APIs internas (`tickets/booking`, `iniciarReserva`) em laço. |
| 6 | `FastSeatsSubmit` (Palmeiras/Flamengo) | Abria URLs internas (`GetWglAutoSeats`, `book-multiple-tickets`) pulando a interface. |
| 7 | `webNavigation.onErrorOccurred` (Eventim) | Ao ser bloqueado (HTTP2), **apagava cookies, cache, localStorage e IndexedDB** do domínio para voltar com sessão "limpa". |
| 8 | Ticketmaster `/blocked`, `gotolasturl` | Ao ser bloqueado, voltava automaticamente para a página anterior. |
| 9 | Queue-it / FIFA waiting room | Saía da fila após 2 min / recarregava a sala de espera periodicamente. |
| 10 | Flamengo/FutebolCard | Removia o `<canvas>` da página de setores, gravava cookie aleatório `___ksy` e reescrevia a URL `/buy/sector` → `/runNNNNN` (evasão de WAF/cache). |
| 11 | `rules.json` | Regra para bloquear scripts `mergedAssets` (não estava ativa no manifest). |
| 12 | Carrinho `cart_keep_alive` | Recarregava/reinseria itens para manter a reserva além do tempo do site. |

**Na v7 nada disso existe.** Quando a página mostra CAPTCHA, fila, login ou bloqueio, o robô
entra em `WAITING_USER`/`PAUSED`, notifica e **não interage**; retoma sozinho quando a página volta
ao normal (exceto bloqueio, que exige decisão do usuário).

### P0 — Segurança e privacidade

| # | Problema | Correção v7 |
|---|----------|-------------|
| 13 | Login enviava **e-mail e senha na query string** (GET `mng.php?...&p={"client":{...password...}}`) para servidor de terceiros. | Sem servidor remoto, sem login, sem credenciais. |
| 14 | `webRequest.onBeforeRequest/onBeforeSendHeaders/onHeadersReceived` em `<all_urls>` com `requestBody`/`extraHeaders`: **logava senhas, tokens e corpos de requisições de todos os sites**; capturava `X-CSRF-Token`. | Permissão `webRequest` removida. |
| 15 | Envio de dados do pedido + **QR Code do PIX** para servidor remoto (WhatsApp). | Removido. Notificação local do Chrome. |
| 16 | Chaves de API fixas no código (`appk`, OCR). | Nenhuma chave; nenhuma chamada de rede da extensão. |
| 17 | Permissões excessivas: `cookies`, `browsingData`, `webRequest`, `webNavigation`, `tabs`, `windows`, `declarativeNetRequest*`, hosts `http://*/*` + `https://*/*`. | Só `storage`, `alarms`, `scripting`, `notifications` + hosts dos sites suportados (gerados dos perfis). Domínios extras via permissão opcional, pedida por perfil. |
| 18 | `web_accessible_resources` expunha `js/*`, `app.html`, `css/*` a qualquer site (fingerprinting da extensão). | Só `sounds/alert.wav`, só nos sites suportados. |
| 19 | Mensagens sem validação (tipos como `"96512452154326"`), sem checar remetente. | Protocolo tipado, validação de cada mensagem, checagem de `sender.id`, `sender.tab`, frame principal e dono da execução (`runId`). |
| 20 | `chrome.runtime.onMessage` no content script **criava `setInterval(redirect, 3000)` a cada mensagem recebida**. | Removido (era vazamento de timers + recarregamento em cascata). |

### P1 — Estabilidade, CPU e memória

| # | Problema | Correção v7 |
|---|----------|-------------|
| 21 | Content script (jQuery 88 KB + `run.js` 173 KB) injetado em **toda página e todo iframe** da web. | Só nos domínios suportados, só no frame principal, inerte até o background confirmar que a aba é a dona da execução. |
| 22 | Polling: laços `while` com `sleep(50ms)`, ciclo principal por intervalo, `for(;;){...sleep(5s)}` infinito (Ticketmaster). | Orientado a eventos: `MutationObserver` + debounce (200 ms; 1 s em fases de espera) + execução única (`SingleFlight`). Nenhum `setInterval` (regra de lint). |
| 23 | `setInterval(checkOpenTabs, 30s)` no service worker **recarregava abas de ingresso** se o content não respondesse em 1 s (inclusive no meio da compra). | Watchdog com `chrome.alarms`, só durante execução: tenta acordar uma vez; persistindo, **pausa com contexto** (nunca recarrega carrinho/checkout). |
| 24 | `send_request_tab`: laço `for(;!checkTabLoaded(e);)` com Promise (sempre "verdadeira") e `sleep` sem `await`; `checktbexists` sempre retorna `true`. | Reescrito com APIs assíncronas reais e tratamento de aba inexistente. |
| 25 | Flags globais (`isProcessing`, `running_clicks`) que ficavam presas em `true` em vários caminhos de erro → robô travado sem aviso. | Máquina de estados explícita + `try/catch` em todo ciclo + classificação de erro. |
| 26 | Sem timeouts em várias esperas; outras com retries sem limite → loops. | Timeout obrigatório em toda espera; retries limitados com backoff exponencial; teto de reloads/hora. |
| 27 | Estado só em memória; reinício do Chrome/SW perdia tudo — ou continuava ações às cegas. | Estado persistido (`chrome.storage.local`), escrita coalescida; reinício do navegador → `PAUSED` aguardando o usuário. |
| 28 | Duplicidade: nenhum controle impedia clicar duas vezes em "adicionar" após reload, nem duas abas executando. | Ledger de ações críticas (`pending/confirmed/failed`) + lock de execução por aba + `Mutex` no background. |
| 29 | Logs só em `console.log` (milhares por minuto), sem níveis. | Logger com níveis, modo DEBUG, buffer circular limitado, gravação em lote, exportação. |

### P2 — Manutenção

| # | Problema | Correção v7 |
|---|----------|-------------|
| 30 | Lógica de cada site espalhada em `switch` gigantes (funções de 1.000+ linhas). | Adapter pattern: perfis JSON declarativos (`src/site/profiles/*.json`). |
| 31 | Seletores frágeis (posição, `eq(n)`, classes geradas) sem fallback. | Lista ordenada de estratégias CSS+texto, com log quando o fallback é usado. |
| 32 | Configuração dependente do servidor remoto; valores mágicos espalhados. | `src/storage/schema.ts`: todos os valores com padrão, limites e validação. |
| 33 | Código morto: `Overwritter/`, `rules.json`, `manifest_firefox.json`, `inject_script` (MV2), `set_temp_action`, bootstrap/fontawesome inteiros. | Removido. |
| 34 | Sem testes, sem build, sem lint, sem tipos. | TypeScript estrito, ESLint, 100 testes unitários/integração + 9 cenários E2E no Chromium. |

---

## 3. O que foi preservado

* O **conhecimento dos sites** obtido em modo interface (URLs de cada etapa, textos de botões,
  seletores conhecidos) virou perfis em `src/site/profiles/`. Como não foi possível testar contra os
  sites reais a partir deste ambiente, todos estão marcados **"não verificado"** — valide com
  *Testar seletores* e modo *Simulação* (ver `docs/PERFIS.md`).
* Recursos legítimos: monitoramento de disponibilidade com atualização periódica, prioridade de
  setores, quantidade, alerta sonoro, foco na aba quando precisa do usuário, início agendado
  (antigo "horário de trabalho").

## 4. O que mudou de comportamento (intencionalmente)

* **Pagamento nunca é automatizado.** O robô vai até o carrinho/checkout e entrega para você.
* **Sem login no "Auto Ticket"/servidor remoto**: tudo é local.
* **Sem suporte** a Webook, Cardiff e FIFA (fluxos da v6 dependiam de OCR/fila). Podem ser
  adicionados como perfis personalizados, respeitando as mesmas regras.
* Firefox (`manifest_firefox.json`) não é mais gerado.
