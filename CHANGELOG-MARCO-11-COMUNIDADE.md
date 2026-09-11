# Marco 11 — Comunidade RPG

Primeira versão funcional da camada social do MaMuSBoaRD.

## Entregue

- Perfis públicos com username, nome de exibição e bio.
- Criação automática de perfil para contas novas.
- Backfill de perfis para usuários existentes.
- Solicitações de amizade e lista de amigos.
- Aprovação/recusa de solicitações via RPC transacional.
- Acesso rápido às campanhas públicas de amigos.
- Descoberta de mesas públicas procurando jogadores.
- Pedido de entrada em mesa usando o fluxo já existente de `campanha_pedidos`.
- Publicação da campanha ativa como mesa da comunidade.
- Campos sociais de campanha: `publica`, `procurando_jogadores`, `vagas_jogadores` e `horario_texto`.
- Interface integrada ao menu desktop e ao menu móvel.

## Banco

Nova migration oficial: `supabase/migrations/0012_social-comunidade.sql`.

A migration não foi executada automaticamente no Supabase remoto. Antes da aplicação em produção, comparar o schema remoto e executar em ambiente controlado.


## Marco 11.1 — Amizade inicial
- Todas as contas existentes no momento da migration `0013_amizade-inicial-contas-existentes.sql` são inseridas como amigas entre si.
- A regra vale apenas para o conjunto de contas já existentes; novas contas continuam usando o fluxo normal de solicitação de amizade.
- A inserção é idempotente com `ON CONFLICT DO NOTHING`.
