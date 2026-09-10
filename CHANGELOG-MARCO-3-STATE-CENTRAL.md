# MaMuSBoaRD — Marco 3: Estado Central

## Objetivo
Tornar o `MAMUS_STATE` a fonte central para os cinco estados globais mais importantes do aplicativo, sem alterar o banco de dados.

## Migração realizada
- `campanhaAtual` → `MAMUS_STATE.campaign.current`
- `campanhasDisponiveis` → `MAMUS_STATE.campaign.available`
- `sistemaAtual` → `MAMUS_STATE.system.current`
- `abaAtual` → `MAMUS_STATE.ui.currentTab`
- `sessaoAtual` → `MAMUS_STATE.session.current`

As declarações legadas foram removidas de `app.js`. O comportamento existente continua utilizando as mesmas funções e os mesmos objetos; a mudança é estrutural para preparar a próxima decomposição do aplicativo.

## Não alterado
- Banco de dados / Supabase
- RLS / migrations
- Contratos de Realtime
- HTML de fichas
- Regras de jogo
- Fluxos de autenticação

## Validação
- `node --check app.js`
- `node --check js/core/state.js`
- `node --check js/core/bootstrap.js`
- `node --check js/realtime.js`
- IDs duplicados: nenhum encontrado em `index.html` e `ficha-editor.html`
- Referências aos cinco nomes legados em `app.js`: 0
