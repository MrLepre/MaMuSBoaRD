# Marco 8 — RPG Modules v1

- Extraído o domínio específico de World Trigger do app.js para js/systems-modules/world-trigger.js.
- Criado registro genérico de módulos em js/systems-modules/registry.js.
- Mantida compatibilidade via window.MAMUS_WT_MODULE e funções públicas globais.
- Realtime e Characters agora conversam com World Trigger por hooks explícitos.
- Nenhuma alteração em Supabase, RLS ou SQL.
- Service Worker atualizado para v22.
