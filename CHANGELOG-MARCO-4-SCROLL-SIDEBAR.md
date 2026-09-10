# Patch — Scroll da Sidebar

## Problema
Em desktop, a navegação lateral podia ultrapassar a altura disponível da sidebar. Como a sidebar usa flex-column e `overflow:hidden`, o bloco de navegação era visualmente cortado no final e não conseguia assumir uma área própria de rolagem.

## Correção
- `min-height: 0` aplicado à sidebar e ao bloco `.abas-navegacao`.
- Navegação lateral passa a usar explicitamente `flex: 1 1 auto`.
- `overflow-y: auto` forçado no container correto.
- Scrollbar vertical discreta reativada para deixar claro que existem mais opções.
- `overscroll-behavior-y: contain` evita que o gesto de rolagem da sidebar "escape" para a página.
- Comportamento mobile existente foi preservado.
- Service worker atualizado para `v17`.


## Hotfix — Supabase bootstrap
- Criado `js/core/supabase.js` para inicializar o cliente antes de Auth/Campanhas.
- `app.js` reutiliza a mesma instância global.
- Cache atualizado para v18.
- Corrige o alerta “Supabase não inicializado” causado pela dependência da inicialização tardia do `app.js`.
