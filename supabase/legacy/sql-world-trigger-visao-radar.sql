-- World Trigger — Radar, Linha de Visão e Geometria Tática
-- Execute no SQL Editor do Supabase da sua aplicação.
-- Seguro para a estrutura atual: apenas adiciona a coluna usada para persistir
-- paredes e coberturas do mapa por campanha.

alter table public.mapas
  add column if not exists dados_taticos jsonb not null default '{"paredes":{},"coberturas":{}}'::jsonb;

comment on column public.mapas.dados_taticos is
  'World Trigger: geometria tática do mapa (paredes e coberturas) em coordenadas de grade.';

-- Mantém a política de acesso existente. O app só atualiza esta coluna quando
-- o usuário é Mestre da campanha; o restante das regras continua nas policies
-- já instaladas na tabela mapas.
