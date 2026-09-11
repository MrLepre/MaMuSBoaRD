# Marco 11 — Comunidade — Correção de carregamento

## Correções
- Comunidade recupera a sessão atual diretamente do Supabase quando o estado central ainda não foi sincronizado.
- Fluxo de carregamento da Comunidade usa `Promise.allSettled` para evitar que uma consulta falha deixe a interface presa em “Carregando...”.
- Login e restauração de sessão recarregam a Comunidade quando ela é a aba ativa.
- Cache-bust do módulo social atualizado.
- Service Worker atualizado para cache v25.
- Smoke test atualizado para refletir a versão de cache atual.

## Objetivo
Corrigir a integração frontend ↔ Supabase observada na Comunidade sem alterar a arquitetura geral do MaMuSBoaRD.
