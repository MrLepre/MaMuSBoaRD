# Marco 6 — Fichas / Characters v1

- Extraído o domínio de fichas/personagens de `app.js` para `js/characters/characters.js`.
- Estado canônico da ficha agora vive em `MAMUS_STATE.character`.
- Mantida compatibilidade global com os nomes usados pela interface legada.
- Fluxo de importação, criação, edição, visualização, salvamento e fichas do grupo foi preservado.
- Listener `cronicas-camelot-ficha-pronta` foi movido para o módulo de personagens.
- Nenhuma alteração de Supabase/RLS/SQL.
- Service Worker atualizado para cache v20.
