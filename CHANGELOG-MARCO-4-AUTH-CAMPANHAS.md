# Marco 4 — Auth + Campanhas

- Extraído o núcleo de autenticação para `js/auth/auth.js`.
- Extraída a camada de serviços de campanhas para `js/campaigns/campaigns.js`.
- Mantida compatibilidade com os handlers HTML existentes via `window`.
- `MAMUS_STATE.auth` e `MAMUS_STATE.campaign` continuam como estado canônico.
- Supabase segue sendo inicializado no app e exposto ao módulo por `window.MAMUS_SUPABASE`.
- Não houve alteração de banco, RLS ou migrações.
- Cache do service worker incrementado para v16.
