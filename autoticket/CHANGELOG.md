# Changelog

## 7.0.0 — 2026-10-01

Reestruturação completa a partir da auditoria da v6 (ver `docs/AUDITORIA.md`).

### Adicionado
- Máquina de estados explícita (IDLE … COMPLETED + WAITING_USER, RETRYING, TIMEOUT, ERROR, PAUSED, STOPPED).
- Ledger de idempotência para ações críticas; lock de execução única; Mutex no service worker.
- Recuperação classificada (transitória/recuperável/permanente/configuração/ambiente) com backoff e limites.
- Timeouts configuráveis em todas as esperas; teto de recarregamentos por hora.
- Watchdog via `chrome.alarms` (aba fechada/descartada/travada, refresh de aba em segundo plano).
- Reinício do navegador → estado recuperado em PAUSED (nunca continua sozinho).
- Perfis de site declarativos (JSON) com seletores em fallback; editor/validador nas Opções.
- Modo Simulação e "Testar seletores" (diagnóstico sem cliques).
- Popup com controles, diagnóstico e logs; indicador na página; parada de emergência (`Ctrl+Shift+Y`).
- Logger com níveis, modo DEBUG, ring buffer, exportação; métricas por etapa.
- Início agendado; notificações do sistema; checklist automático antes de iniciar.
- TypeScript, ESLint, esbuild, 100 testes (vitest/jsdom) e 9 cenários E2E (Chromium).

### Removido (contorno de proteções, fraude, riscos de segurança)
- Criação de contas e "portadores" com dados gerados/de terceiros; OCR de CAPTCHA; clique em reCAPTCHA;
  substitutos de scripts do site; solver de Proof-of-Work e chamadas diretas a APIs internas;
  limpeza de cookies/sessão para driblar bloqueio; fuga de fila/página de bloqueio; evasão de WAF.
- Automação do pagamento (PIX/termos/"Finalizar compra").
- Servidor remoto (login com senha na URL, licença, configuração remota, envio de pedido/QR PIX).
- `webRequest` em todos os sites (logava senhas/tokens), permissões `cookies`, `browsingData`,
  `webNavigation`, `tabs`, `windows`, `declarativeNetRequest*`, hosts `<all_urls>`.
- jQuery/Bootstrap/FontAwesome e código morto (`Overwritter/`, `rules.json`, MV2).
