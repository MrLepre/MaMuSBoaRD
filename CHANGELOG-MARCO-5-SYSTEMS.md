# MaMuSBoaRD — Marco 5: Systems

## Objetivo
Extrair o gerenciamento de sistemas de RPG do `app.js`, preservando a interface, o banco, as políticas RLS e a compatibilidade com as funções legadas.

## Implementado
- `js/systems/systems.js` criado.
- Carregamento/listagem de sistemas centralizado em `MAMUS_SYSTEMS.load()`.
- Seleção de sistema centralizada em `MAMUS_SYSTEMS.select()` e sincronizada com `MAMUS_STATE.system.current`.
- Edição e abertura de ficha movidas para o módulo.
- Botões da lista usam listeners em vez de `onclick` inline.
- `mudarAba('sistemas')` delega ao módulo.
- `app.js` deixa de conter o bloco principal de renderização/listagem/abertura de sistemas.
- Cliente Supabase compartilhado via `MAMUS_SUPABASE`.
- Nenhuma alteração no schema ou SQL.
- Service Worker atualizado para v19.

## Mantido no app.js
O builder de sistemas e as funções `garantirSistema*` continuam temporariamente no `app.js` porque dependem de estado e lógica de construção já existentes. Elas são chamadas pelo módulo através da API global de compatibilidade. A próxima extração poderá separar o builder sem aumentar o risco deste marco.
