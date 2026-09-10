-- MaMuSBoaRD canonical migration 0001
-- Core multicampaign schema. No seed data.

create extension if not exists pgcrypto;

create table if not exists public.sistemas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text default '',
  configuracao jsonb not null default '{}'::jsonb,
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campanhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text default '',
  sistema_id uuid references public.sistemas(id) on delete set null,
  mestre_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campanha_membros (
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'jogador' check (papel in ('mestre','jogador')),
  joined_at timestamptz not null default now(),
  primary key (campanha_id, user_id)
);

-- Colunas de isolamento nos recursos existentes.
alter table public.fichas add column if not exists campanha_id uuid references public.campanhas(id) on delete cascade;
alter table public.mapas add column if not exists campanha_id uuid references public.campanhas(id) on delete cascade;
alter table public.galeria_imagens add column if not exists campanha_id uuid references public.campanhas(id) on delete cascade;


create index if not exists idx_campanhas_mestre on public.campanhas(mestre_id);
create index if not exists idx_campanhas_sistema on public.campanhas(sistema_id);
create index if not exists idx_membros_usuario on public.campanha_membros(user_id);
create index if not exists idx_fichas_campanha on public.fichas(campanha_id);
create index if not exists idx_mapas_campanha on public.mapas(campanha_id);
create index if not exists idx_galeria_campanha on public.galeria_imagens(campanha_id);

