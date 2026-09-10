# Marco 10 — Testes e limpeza

## Objetivo
Fechar a primeira sequência de fundação técnica com uma camada mínima de validação automática e remover resíduos que poderiam voltar a causar regressões.

## Alterações
- Adicionado `tests/smoke-test.js` para validação local do projeto.
- Validação automática de sintaxe de todos os arquivos JavaScript.
- Validação automática de IDs duplicados em HTML, ignorando IDs gerados por templates `${...}`.
- Verificação dos arquivos estruturais obrigatórios.
- Removidos backups acidentais da raiz (`*.bak`) e `app_head.txt`.
- `app.js` deixou de enviar eventos diretamente por `canalMesa.send()`; os broadcasts passam por `MAMUS_REALTIME.send()`.
- Removido o fallback global de `touchmove` que executava `window.scrollBy()` e `preventDefault()` para simular rolagem da página no celular.
- Atualizado cache-bust do `app.js` para `marco10-cleanup-v1`.
- Service Worker atualizado para `mamus-cache-v23`.

## Resultado da validação
`node tests/smoke-test.js` → **53/53 checks OK**.

## Limite deste marco
Nenhum SQL foi executado no Supabase remoto. O Marco 10 valida a árvore do código e a consistência estática; testes reais de Auth, RLS, Storage, Realtime e VTT continuam dependendo de um ambiente remoto/teste.
