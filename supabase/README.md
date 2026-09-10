# MaMuSBoaRD — Supabase canonical layout

## Regra a partir do Marco 9

`supabase/migrations/` é a única sequência canônica de schema/RLS do projeto.

Os arquivos `sql-*.sql` da raiz foram preservados em `supabase/legacy/` por histórico e compatibilidade, mas **não devem ser executados novamente em ordem aleatória**.

Correções/seed/backfill que dependem do ambiente ficam em `supabase/seeds/` e devem ser executados conscientemente.

## Ordem canônica

1. `0001_core_multicampanha.sql`
2. `0002_security_rls.sql`
3. `0003_campaign_lifecycle.sql`
4. `0004_campaign_requests.sql`
5. `0005_sessions.sql`
6. `0006_vtt_tokens.sql`
7. `0007_noctavell.sql`
8. `0008_eter_brasas_calendar.sql`
9. `0009_eter_brasas_economy.sql`
10. `0010_world_trigger.sql`
11. `0011_world_trigger_tactical_geometry.sql`

## Importante

Este marco **não executa nenhuma migration no Supabase remoto**. O ZIP representa a fonte canônica do repositório.

Antes de aplicar em produção, comparar o schema remoto e gerar/validar um diff. Não assumir que o banco remoto está exatamente igual aos arquivos históricos.

## Regras de segurança

- RLS permanece obrigatório nas tabelas protegidas.
- `eh_master_global()`, `eh_mestre_da_campanha()` e `eh_membro_da_campanha()` são as funções centrais de autorização.
- A chave publishable do frontend não é um segredo; a proteção real está no RLS.
- Não colocar service-role key no frontend.
- Seeds de usuários/mestres não fazem parte da migration estrutural.
