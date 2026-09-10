-- ============================================================
-- ÉTER & BRASAS — ECONOMIA VIVA + JORNAIS
-- Execute depois da migração de multicampanha.
-- Todos os registros pertencem a uma campanha.
-- ============================================================

create table if not exists public.economia_mercados (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  nome text not null,
  regiao text not null default 'Mundo',
  moeda_codigo text not null default 'LUM',
  moeda_simbolo text,
  riqueza numeric not null default 5,
  inflacao numeric not null default 0,
  observacoes text default '',
  atualizado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.economia_itens (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  mercado_id uuid references public.economia_mercados(id) on delete set null,
  nome text not null,
  categoria text not null default 'Mercadoria',
  moeda_codigo text not null default 'LUM',
  preco_base numeric not null default 0,
  modificador_percentual numeric not null default 0,
  oferta numeric not null default 0,
  demanda numeric not null default 0,
  descricao text default '',
  atualizado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.economia_eventos (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  titulo text not null,
  tipo text not null default 'Outro',
  regiao text not null default 'Mundo',
  intensidade integer not null default 3 check (intensidade between 1 and 5),
  icone text default '🌪️',
  descricao text not null default '',
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.jornais_campanha (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  titulo text not null,
  manchete text default '',
  conteudo text not null default '',
  categoria text not null default 'Mundo',
  regiao text not null default 'Mundo',
  importancia integer not null default 3 check (importancia between 1 and 5),
  publicado boolean not null default true,
  publicado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_economia_mercados_campanha on public.economia_mercados(campanha_id);
create index if not exists idx_economia_itens_campanha on public.economia_itens(campanha_id);
create index if not exists idx_economia_itens_mercado on public.economia_itens(mercado_id);
create index if not exists idx_economia_eventos_campanha on public.economia_eventos(campanha_id, created_at desc);
create index if not exists idx_jornais_campanha_publicacao on public.jornais_campanha(campanha_id, publicado, publicado_em desc);

-- Segurança: jogador lê a economia da campanha; somente Mestre da campanha edita.
alter table public.economia_mercados enable row level security;
alter table public.economia_itens enable row level security;
alter table public.economia_eventos enable row level security;
alter table public.jornais_campanha enable row level security;

drop policy if exists "Membros leem mercados" on public.economia_mercados;
drop policy if exists "Mestre gerencia mercados" on public.economia_mercados;
create policy "Membros leem mercados" on public.economia_mercados
  for select using (public.eh_membro_da_campanha(campanha_id));
create policy "Mestre gerencia mercados" on public.economia_mercados
  for all using (public.eh_mestre_da_campanha(campanha_id))
  with check (public.eh_mestre_da_campanha(campanha_id));

drop policy if exists "Membros leem mercadorias" on public.economia_itens;
drop policy if exists "Mestre gerencia mercadorias" on public.economia_itens;
create policy "Membros leem mercadorias" on public.economia_itens
  for select using (public.eh_membro_da_campanha(campanha_id));
create policy "Mestre gerencia mercadorias" on public.economia_itens
  for all using (public.eh_mestre_da_campanha(campanha_id))
  with check (public.eh_mestre_da_campanha(campanha_id));

drop policy if exists "Membros leem eventos economia" on public.economia_eventos;
drop policy if exists "Mestre gerencia eventos economia" on public.economia_eventos;
create policy "Membros leem eventos economia" on public.economia_eventos
  for select using (public.eh_membro_da_campanha(campanha_id));
create policy "Mestre gerencia eventos economia" on public.economia_eventos
  for all using (public.eh_mestre_da_campanha(campanha_id))
  with check (public.eh_mestre_da_campanha(campanha_id));

drop policy if exists "Membros leem jornais publicados" on public.jornais_campanha;
drop policy if exists "Mestre gerencia jornais" on public.jornais_campanha;
create policy "Membros leem jornais publicados" on public.jornais_campanha
  for select using (public.eh_membro_da_campanha(campanha_id) and publicado = true);
create policy "Mestre gerencia jornais" on public.jornais_campanha
  for all using (public.eh_mestre_da_campanha(campanha_id))
  with check (public.eh_mestre_da_campanha(campanha_id));

-- Mantém updated_at sem exigir funções externas específicas.
create or replace function public.atualizar_updated_at_economia_jornais()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_economia_mercados_updated_at on public.economia_mercados;
create trigger trg_economia_mercados_updated_at before update on public.economia_mercados for each row execute function public.atualizar_updated_at_economia_jornais();
drop trigger if exists trg_economia_itens_updated_at on public.economia_itens;
create trigger trg_economia_itens_updated_at before update on public.economia_itens for each row execute function public.atualizar_updated_at_economia_jornais();
drop trigger if exists trg_jornais_updated_at on public.jornais_campanha;
create trigger trg_jornais_updated_at before update on public.jornais_campanha for each row execute function public.atualizar_updated_at_economia_jornais();

-- Opcional: cria um mercado inicial para cada campanha Éter & Brasas existente.
-- Não cria mercadorias automaticamente, porque o Mestre deve definir a economia de cada mundo.
insert into public.economia_mercados (campanha_id, nome, regiao, moeda_codigo, moeda_simbolo, riqueza, observacoes)
select c.id, 'Mercado Central', 'Mundo', 'LUM', 'Ł', 5, 'Mercado inicial da campanha. O Mestre pode renomear e ajustar.'
from public.campanhas c
join public.sistemas s on s.id = c.sistema_id
where s.configuracao->>'tipo' = 'eter_brasas'
and not exists (select 1 from public.economia_mercados m where m.campanha_id = c.id);
