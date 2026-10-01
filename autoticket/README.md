# AutoTicket v7 — extensão Chrome (Manifest V3)

Compra **assistida** de ingressos: o robô monitora a disponibilidade, seleciona setor/tipo/quantidade
pela interface do site e adiciona ao carrinho — e chama você sempre que o site exige uma pessoa
(CAPTCHA, fila virtual, login, bloqueio) e para o pagamento.

> **O que o robô nunca faz:** resolver CAPTCHA, sair/furar fila, criar contas, usar dados de
> terceiros, contornar bloqueios/antifraude, chamar APIs internas do site ou pagar por você.
> Detalhes da revisão da versão anterior: [`docs/AUDITORIA.md`](docs/AUDITORIA.md).

---

## 1. Instalação

Requisitos: Chrome/Chromium/Edge **120+**. Para compilar: Node.js **22.12+**.

```bash
cd autoticket
npm install
npm run build          # gera dist/
npm run package        # (opcional) gera release/autoticket-<versão>.zip
```

No Chrome: `chrome://extensions` → ative **Modo do desenvolvedor** → **Carregar sem compactação** →
selecione a pasta `autoticket/dist`. Fixe o ícone na barra.

Na primeira instalação a página de **Configurações** abre sozinha.

### Atualização

```bash
git pull && npm install && npm run build
```

Depois, em `chrome://extensions`, clique em ⟳ (recarregar) na extensão. Abas abertas dos sites
voltam a funcionar sem recarregar (o robô se reinjeta quando você clica em *Iniciar*). Suas
configurações e perfis personalizados são mantidos (`chrome.storage.local`).

## 2. Configuração (Opções)

| Seção | Campos |
|-------|--------|
| **Alvo** | palavras-chave do evento, URL do evento (opcional), **setores em ordem de prioridade**, tipos de ingresso, quantidade (1–10; nunca excede o limite do site) |
| **Comportamento** | modo **Real** ou **Simulação**; intervalo de atualização (mín. 10 s); teto de recarregamentos/hora; tentativas de seleção; início agendado; espera máxima por você; abrir checkout automaticamente; notificações; som |
| **Timeouts e recuperação** | carregamento, elemento, seleção, confirmação do carrinho, checkout, watchdog; tentativas e backoff |
| **Logs** | modo DEBUG, tamanho máximo |

Use `*` na lista de setores para "qualquer outro disponível" (ex.: `Norte`, `Sul`, `*`).
Exportar/Importar salva tudo (inclusive perfis) em JSON.

## 3. Uso

1. Faça login no site e abra a **página do evento** (ou a lista de eventos, se configurou
   palavras-chave/URL).
2. Clique no ícone → **Iniciar**. O **checklist automático** valida: aba, perfil do site,
   permissão, configuração, preferências e ausência de outra execução. Se algo falhar, ele **não
   inicia** e diz o motivo.
3. Acompanhe pelo popup ou pelo **indicador na própria página** (canto superior direito, com botão
   *Parar*).
4. Quando o ingresso entra no carrinho você recebe notificação + som e a aba é ativada. Finalize o
   pagamento manualmente.

### Controles

| Botão | Efeito |
|-------|--------|
| **Iniciar** | nova execução na aba atual (uma por vez) |
| **Pausar / Retomar** | suspende sem perder o estado; *Retomar* reavalia a página antes de agir |
| **Parar** | encerra a execução |
| **PARADA DE EMERGÊNCIA** (ou `Ctrl+Shift+Y`) | grava STOPPED primeiro, cancela timers/observers/esperas na aba, libera o lock e salva logs |
| **Redefinir estado** | limpa execução, histórico de ações e erros |
| **Testar seletores** | diagnóstico do perfil na página atual, sem clicar em nada |

### Estados exibidos

`● PARADO` · `● EXECUTANDO` · `● AGUARDANDO` · `● PROCESSANDO` · `● PAUSADO` · `● FINALIZADO` · `● ERRO`

O motivo aparece sempre embaixo (ex.: "Aguardando disponibilidade: Norte, Sul (atualiza a cada 30s)",
"Verificação de segurança/CAPTCHA na tela — resolva manualmente").

## 4. Como funciona

### Máquina de estados

```
IDLE → INITIALIZING → WAITING_PAGE → DETECTING_EVENT → WAITING_AVAILABILITY → SELECTING → CART → CHECKOUT → COMPLETED
                         ↑               (lista)           (refresh periódico)    (passos)     (aviso)  (entrega)
   qualquer fase ativa → WAITING_USER (CAPTCHA/fila/login: espera passiva, retoma sozinho)
                       → RETRYING (erro transitório: backoff) → TIMEOUT / ERROR
                       → PAUSED (usuário, bloqueio, ambiguidade, limite) → (Retomar) WAITING_PAGE
                       → STOPPED (Parar/Emergência)
```

Toda transição é validada por `src/core/machine.ts`; transições inválidas são ignoradas e logadas.

### Idempotência (nada crítico é feito duas vezes)

* "Adicionar ao carrinho" é registrado num **ledger** antes do clique (`pending`) e só vira
  `confirmed` (carrinho/indicador/mensagem) ou `failed` (mensagem de rejeição do site).
* Se a página recarregar ou o navegador reiniciar com uma ação `pending`, o robô **pausa** e pede
  para você verificar o carrinho — nunca clica de novo por conta própria. Ao clicar *Retomar*, você
  confirma que pode tentar novamente.
* Só uma execução ativa por vez (lock por aba + `Mutex` no service worker).

### Recuperação e timeouts

| Falha | Classe | Ação |
|-------|--------|------|
| Página de erro (502/503/504), elemento demorou, página não carregou | transitória | retry com backoff exponencial (até *máx. tentativas*), depois pausa |
| Seleção rejeitada (esgotou, limite) | recuperável | tenta a próxima preferência (até *tentativas de seleção*) |
| Clique sem confirmação | recuperável | pausa (ambíguo — decisão sua) |
| Bloqueio pelo site | permanente | pausa |
| Perfil/permissão/configuração | configuração | não inicia / pausa com instrução |
| Aba fechada/descartada, sem resposta, navegador reiniciado | ambiente | watchdog tenta acordar uma vez; depois pausa |

Nenhuma espera é infinita: todas têm timeout configurável. Recarregamentos respeitam o intervalo
mínimo e o teto por hora. Abas em segundo plano (onde o Chrome congela timers) são atualizadas
pelo watchdog via `chrome.alarms`. Durante a execução a aba é marcada como não descartável.

### Eficiência

* Content script só nos sites suportados, só no frame principal, **inerte** em abas sem execução.
* Sem polling: reage a mutações do DOM (MutationObserver) com debounce (200 ms; 1 s nas fases de
  espera) e execução única coalescida. Texto da página lido no máximo uma vez por ciclo.
* Medido no E2E: DOM mudando a cada 50 ms → custo do robô ≈ **3–4 % de um núcleo**; heap ≈ 1,4 MB.
* Logs e estado gravados em lote; log limitado (padrão 500 linhas).

## 5. Arquitetura

```
src/
├── core/                 núcleo — não conhece Chrome nem sites
│   ├── types.ts          fases, tipos de página, estado, logs
│   ├── machine.ts        máquina de estados (tabela de transições)
│   ├── state.ts          aplicação de eventos ao estado (puro)
│   ├── errors.ts         BotError, classificação, política de recuperação, backoff
│   ├── scheduler.ts      dono de timers/observers/listeners; dispose; SingleFlight; debounce
│   ├── lock.ts           Mutex + ledger de idempotência
│   ├── logger.ts         níveis, ring buffer, sanitização
│   └── metrics.ts        tempo por etapa, contadores, esperas
├── site/                 ADAPTER — tudo que é específico de site
│   ├── types.ts          contrato SiteProfile
│   ├── detectors.ts      classificação de página (evento, carrinho, CAPTCHA, fila, erro…)
│   ├── selectors.ts      seletores com fallback, ranking por preferência
│   ├── actions.ts        clique, quantidade, mensagens de feedback
│   ├── flows.ts          Runner: fluxo orientado a eventos na aba
│   └── profiles/*.json   perfis embutidos (domínios do manifest vêm daqui)
├── storage/              CONFIGURAÇÃO (settings), ESTADO (run), LOG (logs)
├── utils/                dom, timing, text, url
└── extension/
    ├── background/       service worker: RunController (estado, lock, watchdog, checklist)
    ├── content/          content script, indicador na página, teste de seletores
    ├── popup/            controle + diagnóstico
    ├── options/          configuração, perfis, logs, diagnóstico
    └── shared/           protocolo de mensagens validado, helpers de UI
```

Fluxo de mensagens: o **background é o dono do estado**; o content script propõe eventos
(`run/report`), pede autorização para ações críticas (`run/claim`) e para recarregar
(`run/reload`); o background valida (remetente, aba, `runId`, transição) e responde com o estado
oficial.

### Persistência (`chrome.storage.local`)

| Chave | Conteúdo |
|-------|----------|
| `settings` | configuração normalizada (versão de esquema, limites aplicados) |
| `run` | fase, motivo, aba, tempos, última ação, tentativas, reloads da última hora, último erro, ledger, métricas |
| `logs` | últimas N linhas (ring buffer) |

Nenhum dado pessoal, senha, cookie ou token é armazenado ou enviado. A extensão não faz
requisições de rede próprias.

### Permissões

`storage`, `alarms`, `scripting` (reinjetar em abas abertas antes da instalação), `notifications`;
hosts: somente os domínios dos perfis + `*.queue-it.net` (apenas para *reconhecer* a fila).
Domínios de perfis personalizados são pedidos individualmente (permissão opcional).

## 6. Logs e diagnóstico

* Níveis: `DEBUG` (só com modo DEBUG), `INFO`, `WARNING`, `ERROR`, `SUCCESS`.
* Popup: últimas 25 linhas + painel de diagnóstico (estado, última ação, tempo de execução,
  tentativas, recarregamentos, próxima atualização, último erro, página atual, última atividade).
* Opções › Logs: filtro por nível/texto, exportar JSON, limpar.
* Opções › Diagnóstico: métricas (tempo por fase, tempo até a 1ª ação, espera média/máxima por
  elemento, contadores de reloads/retries/cliques), ledger de ações e estado bruto.
* Contexto sensível (`password`, `token`, `cookie`, `cpf`…) é mascarado automaticamente.

## 7. Solução de problemas

| Sintoma | Causa provável / ação |
|---------|-----------------------|
| "Não iniciado: Site suportado (perfil)" | Domínio sem perfil → crie um em Opções › Perfis. |
| "Permissão de acesso ao site" | Opções › Perfis › *Conceder permissão*; ou `chrome://extensions` › Detalhes › Acesso ao site. |
| Fica em "Aguardando uma página reconhecida" | A URL não casa com `pages` do perfil → *Testar seletores* mostra o tipo detectado. |
| Disponível no site mas o robô não vê | Seletor do passo `probe` desatualizado → *Testar seletores* (Achados = 0) e ajuste o perfil. |
| Log "fallback N usado" | O seletor principal mudou no site; atualize o perfil (ainda funciona pelo fallback). |
| Pausou: "Não foi possível confirmar…" | Clique em "adicionar" sem confirmação. Verifique o carrinho; se não entrou, *Retomar*. |
| Pausou: "Limite de recarregamentos/hora" | Aumente o intervalo ou o teto (com moderação). |
| Pausou: "A aba parou de responder/foi descartada" | Recarregue a aba e use *Retomar*. Mantenha a aba aberta (pode ficar em segundo plano). |
| "Navegador reiniciado…" | Comportamento seguro esperado: verifique a página e *Retomar*. |
| Sem som | O Chrome bloqueia áudio sem interação na aba; clique uma vez na página. |
| Atualizei a extensão e a aba não reage | Clique *Iniciar* de novo (o content script órfão se desliga sozinho e é reinjetado). |

## 8. Desenvolvimento

```bash
npm run typecheck     # TypeScript estrito
npm run lint          # ESLint (proíbe setInterval, exige ===, imports de tipo…)
npm test              # 100 testes (vitest + jsdom): núcleo, perfis, detecção, Runner+Controller integrados
npm run test:e2e      # build E2E + Chromium real contra site simulado local (9 cenários)
npm run check         # typecheck + lint + test + build
npm run watch         # rebuild contínuo em dist/
```

* E2E usa `/opt/pw-browsers/chromium` ou `CHROME_PATH=/caminho/chrome npm run test:e2e`.
* O build E2E (`dist-e2e/`) inclui um perfil para `http://127.0.0.1` — **nunca** carregue
  `dist-e2e` no seu navegador do dia a dia.
* Perfis: veja [`docs/PERFIS.md`](docs/PERFIS.md). Mudanças: [`CHANGELOG.md`](CHANGELOG.md).
