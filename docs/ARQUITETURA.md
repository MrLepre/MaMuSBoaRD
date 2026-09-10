# MaMuSBoaRD — Arquitetura

## Estado atual

O projeto continua sendo uma aplicação web estática baseada em HTML/CSS/JavaScript, usando Supabase no backend e Service Worker/PWA no cliente.

O `app.js` legado permanece ativo durante a refatoração. O objetivo desta etapa é criar uma fundação sem quebrar funcionalidades existentes.

## Marco 1 — Core State

Foram adicionados:

- `js/core/state.js`
- `js/core/bootstrap.js`

O estado central fica disponível em `window.MAMUS_STATE` e sua API em `window.MAMUS_CORE`.

### Estado inicial

- `app`
- `auth`
- `campaign`
- `system`
- `character`
- `session`
- `ui`
- `realtime`

### Regra de transição

O estado central **não substitui ainda** as variáveis legadas de `app.js`. Nesta fase ele funciona como contrato e ponto de migração.

Cada domínio será migrado individualmente, mantendo uma ponte de compatibilidade até que nenhuma dependência antiga permaneça.

## Próximos marcos

1. Separar bootstrap real de `atualizarStatusConexao`.
2. Extrair realtime.
3. Migrar estado de autenticação.
4. Migrar campanhas/sistema.
5. Migrar fichas.
6. Migrar tabletop/VTT.
7. Extrair módulos específicos de cada sistema RPG.
8. Consolidar migrations do Supabase.

## Regra importante

Não fazer uma migração completa para framework neste momento. A refatoração deve preservar o comportamento atual e reduzir acoplamento gradualmente.
