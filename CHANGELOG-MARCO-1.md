# MaMuSBoaRD — Marco 1: Core State

## Objetivo

Iniciar a refatoração arquitetural sem alterar a experiência ou remover funcionalidades existentes.

## Alterações

- Adicionado `js/core/state.js` com estado central de transição.
- Adicionado `js/core/bootstrap.js` com contrato de inicialização do Core.
- Core carregado antes do `app.js` legado.
- Service Worker atualizado para v14 e incluindo os novos arquivos do Core no shell.
- Adicionado `docs/ARQUITETURA.md` documentando a estratégia de migração.
- Adicionado este changelog.

## Compatibilidade

O `app.js` original continua sendo executado. Nenhuma feature foi deliberadamente removida nesta etapa.

## Próxima etapa

Separar o bootstrap real do `app.js`, começando pela responsabilidade hoje concentrada em `atualizarStatusConexao` e no bloco `DOMContentLoaded`.
