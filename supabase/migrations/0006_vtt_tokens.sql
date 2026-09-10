-- MaMuSBoaRD canonical migration
-- Source consolidated from the historical project SQL.

-- =============================================================
-- MaMuSBoaRD — Persistência de Tokens do Mapa
-- Não apaga dados existentes.
-- Execute no Supabase SQL Editor.
-- =============================================================

create table if not exists public.vtt_tokens (
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  id text not null,
  nome text not null default 'Personagem',
  x numeric not null default 10,
  y numeric not null default 10,
  tamanho integer not null default 45,
  imagem_url text,
  imagem_storage_path text,
  imagem_bucket text,
  imagem_publico boolean not null default true,
  hp_atual numeric not null default 50,
  hp_max numeric not null default 50,
  squad text not null default '',
  bagworm boolean not null default false,
  chameleon boolean not null default false,
  trion text,
  triggers jsonb not null default '[]'::jsonb,
  owner_user_id uuid references auth.users(id) on delete set null,
  owner_nick text not null default '',
  tipo text not null default '',
  npc_index integer,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (campanha_id, id)
);

alter table public.vtt_tokens enable row level security;

create index if not exists idx_vtt_tokens_campanha_atualizado
  on public.vtt_tokens (campanha_id, atualizado_em);

create index if not exists idx_vtt_tokens_owner
  on public.vtt_tokens (owner_user_id);

-- Compatibilidade caso a tabela tenha sido criada em uma tentativa anterior.
alter table public.vtt_tokens add column if not exists imagem_storage_path text;
alter table public.vtt_tokens add column if not exists imagem_bucket text;
alter table public.vtt_tokens add column if not exists imagem_publico boolean not null default true;
alter table public.vtt_tokens add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
alter table public.vtt_tokens add column if not exists owner_nick text not null default '';
alter table public.vtt_tokens add column if not exists tipo text not null default '';
alter table public.vtt_tokens add column if not exists npc_index integer;
alter table public.vtt_tokens add column if not exists criado_em timestamptz not null default now();
alter table public.vtt_tokens add column if not exists atualizado_em timestamptz not null default now();

-- Recria somente as policies desta tabela.
drop policy if exists "Membros veem tokens da campanha" on public.vtt_tokens;
drop policy if exists "Jogador cria proprio token" on public.vtt_tokens;
drop policy if exists "Dono ou Mestre atualiza token" on public.vtt_tokens;
drop policy if exists "Dono ou Mestre apaga token" on public.vtt_tokens;

create policy "Membros veem tokens da campanha"
on public.vtt_tokens for select to authenticated
using (public.eh_membro_da_campanha(campanha_id));

create policy "Jogador cria proprio token"
on public.vtt_tokens for insert to authenticated
with check (
  public.eh_membro_da_campanha(campanha_id)
  and (
    owner_user_id = auth.uid()
    or public.eh_mestre_da_campanha(campanha_id)
  )
);

create policy "Dono ou Mestre atualiza token"
on public.vtt_tokens for update to authenticated
using (
  public.eh_membro_da_campanha(campanha_id)
  and (
    owner_user_id = auth.uid()
    or public.eh_mestre_da_campanha(campanha_id)
  )
)
with check (
  public.eh_membro_da_campanha(campanha_id)
  and (
    owner_user_id = auth.uid()
    or public.eh_mestre_da_campanha(campanha_id)
  )
);

create policy "Dono ou Mestre apaga token"
on public.vtt_tokens for delete to authenticated
using (
  public.eh_mestre_da_campanha(campanha_id)
  or owner_user_id = auth.uid()
);

-- Atualiza automaticamente o timestamp de alteração.
create or replace function public.vtt_tokens_atualizar_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_vtt_tokens_atualizado_em on public.vtt_tokens;
create trigger trg_vtt_tokens_atualizado_em
before update on public.vtt_tokens
for each row execute function public.vtt_tokens_atualizar_timestamp();

comment on table public.vtt_tokens is 'Tokens persistentes dos mapas da MaMuSBoaRD, isolados por campanha.';
