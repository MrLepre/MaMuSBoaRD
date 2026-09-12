# MaMuSBoaRD — Marco 12 — Realtime robusto

## Correções
- Estado da conexão agora distingue `connecting`, `online` e `offline`.
- Realtime exibe `Távola sincronizada` somente após `SUBSCRIBED`.
- Timeout de 12s evita ficar indefinidamente em “Conectando à Távola...”.
- Reconexão automática com backoff progressivo para `CHANNEL_ERROR`, `TIMED_OUT` e `CLOSED`.
- Evita múltiplos canais `sala-rpg-geral`.
- Estado central registra status/texto do Realtime.
- Cache-bust atualizado e Service Worker em v26.
