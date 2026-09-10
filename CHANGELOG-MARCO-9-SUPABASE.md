# Marco 9 — Supabase / RLS / SQL

## Objetivo
Organizar a camada SQL do MaMuSBoaRD em uma sequência canônica de migrations, sem alterar o banco remoto automaticamente.

## Entregue
- `supabase/migrations/` com 11 migrations ordenadas.
- RLS e funções de autorização consolidadas em `0002_security_rls.sql`.
- Ciclo de vida de campanhas isolado em `0003_campaign_lifecycle.sql`.
- Domínios posteriores separados por responsabilidade.
- SQL histórico preservado em `supabase/legacy/`.
- Seeds, backfills e correções pontuais separados em `supabase/seeds/`.
- Documentação da ordem e das regras de aplicação.

## Segurança
Nenhuma service-role key foi adicionada.
Nenhuma policy foi removida do banco remoto.
Nenhuma migration foi executada contra o projeto Supabase remoto.

## Próximo passo obrigatório antes de produção
Comparar o schema remoto com a sequência canônica e aplicar somente o diff necessário. O ZIP do projeto não comprova sozinho o estado atual do banco remoto.
