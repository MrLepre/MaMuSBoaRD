-- =============================================================
-- CRÔNICAS DE CAMELOT — ARQUITETURA MULTICAMPANHA / ETAPA 1
-- Cria Sistemas + Campanhas + Membros e isola os dados existentes.
-- Execute DEPOIS de sql-galeria-profissional.sql.
-- =============================================================

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

-- Sistema padrão correspondente à mesa que já existe.
insert into public.sistemas (nome, descricao, configuracao, criado_por)
select
  'Crônicas de Camelot',
  'Sistema atual da campanha, preservado como sistema inicial da nova arquitetura.',
  jsonb_build_object(
    'tipo', 'legado',
    'dados', jsonb_build_array('d4','d6','d8','d10','d12','d20','d100'),
    'ficha', 'ficha-editor.html'
  ),
  u.id
from auth.users u
where lower(coalesce(u.email,'')) = 'mestre@rpg.local'
  and not exists (select 1 from public.sistemas s where lower(s.nome) = 'crônicas de camelot');

-- Campanha padrão. Só é criada se o Mestre já existir.
insert into public.campanhas (nome, descricao, sistema_id, mestre_id)
select
  'Crônicas de Camelot',
  'Campanha original migrada para a arquitetura multicampanha.',
  s.id,
  u.id
from public.sistemas s
cross join auth.users u
where lower(s.nome) = 'crônicas de camelot'
  and lower(coalesce(u.email,'')) = 'mestre@rpg.local'
  and not exists (select 1 from public.campanhas c where lower(c.nome) = 'crônicas de camelot');

-- O Mestre passa a ser membro da campanha padrão.
insert into public.campanha_membros (campanha_id, user_id, papel)
select c.id, c.mestre_id, 'mestre'
from public.campanhas c
where lower(c.nome) = 'crônicas de camelot' and c.mestre_id is not null
on conflict (campanha_id, user_id) do update set papel = 'mestre';

-- Backfill de dados existentes para a campanha padrão.
update public.fichas
set campanha_id = (select c.id from public.campanhas c where lower(c.nome) = 'crônicas de camelot' order by c.created_at asc limit 1)
where campanha_id is null;

update public.mapas
set campanha_id = (select c.id from public.campanhas c where lower(c.nome) = 'crônicas de camelot' order by c.created_at asc limit 1)
where campanha_id is null;

update public.galeria_imagens
set campanha_id = (select c.id from public.campanhas c where lower(c.nome) = 'crônicas de camelot' order by c.created_at asc limit 1)
where campanha_id is null;

-- Usuários que já possuíam ficha entram automaticamente na campanha original.
insert into public.campanha_membros (campanha_id, user_id, papel)
select
  f.campanha_id,
  f.user_id,
  case when f.user_id = c.mestre_id then 'mestre' else 'jogador' end
from public.fichas f
join public.campanhas c on c.id = f.campanha_id
where f.campanha_id is not null
on conflict (campanha_id, user_id) do nothing;

-- Usuários que só possuem imagens não devem ganhar acesso à campanha;
-- imagens antigas continuam pertencendo à campanha padrão, mas o acesso será
-- determinado pelo vínculo do usuário na campanha.

create index if not exists idx_campanhas_mestre on public.campanhas(mestre_id);
create index if not exists idx_campanhas_sistema on public.campanhas(sistema_id);
create index if not exists idx_membros_usuario on public.campanha_membros(user_id);
create index if not exists idx_fichas_campanha on public.fichas(campanha_id);
create index if not exists idx_mapas_campanha on public.mapas(campanha_id);
create index if not exists idx_galeria_campanha on public.galeria_imagens(campanha_id);

-- =============================================================
-- FUNÇÕES AUXILIARES DE ACESSO
-- =============================================================

create or replace function public.eh_mestre_da_campanha(p_campanha uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.campanhas c
    where c.id = p_campanha and c.mestre_id = auth.uid()
  );
$$;

create or replace function public.eh_membro_da_campanha(p_campanha uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.campanha_membros m
    where m.campanha_id = p_campanha and m.user_id = auth.uid()
  );
$$;

grant execute on function public.eh_mestre_da_campanha(uuid) to authenticated;
grant execute on function public.eh_membro_da_campanha(uuid) to authenticated;

-- =============================================================
-- RLS — CAMPANHAS / SISTEMAS / MEMBROS
-- =============================================================

alter table public.sistemas enable row level security;
alter table public.campanhas enable row level security;
alter table public.campanha_membros enable row level security;

 drop policy if exists "Sistemas visiveis para autenticados" on public.sistemas;
 drop policy if exists "Mestre cria sistemas" on public.sistemas;
 drop policy if exists "Mestre atualiza sistemas" on public.sistemas;
 drop policy if exists "Membros veem campanhas" on public.campanhas;
 drop policy if exists "Mestre cria campanhas" on public.campanhas;
 drop policy if exists "Mestre atualiza campanhas" on public.campanhas;
 drop policy if exists "Membros veem membros" on public.campanha_membros;
 drop policy if exists "Mestre gerencia membros" on public.campanha_membros;

create policy "Sistemas visiveis para autenticados"
on public.sistemas for select to authenticated
using (true);

create policy "Mestre cria sistemas"
on public.sistemas for insert to authenticated
with check (lower(coalesce(auth.jwt()->>'email','')) = 'mestre@rpg.local');

create policy "Mestre atualiza sistemas"
on public.sistemas for update to authenticated
using (lower(coalesce(auth.jwt()->>'email','')) = 'mestre@rpg.local')
with check (lower(coalesce(auth.jwt()->>'email','')) = 'mestre@rpg.local');

create policy "Membros veem campanhas"
on public.campanhas for select to authenticated
using (public.eh_membro_da_campanha(id) or mestre_id = auth.uid());

create policy "Mestre cria campanhas"
on public.campanhas for insert to authenticated
with check (mestre_id = auth.uid() and lower(coalesce(auth.jwt()->>'email','')) = 'mestre@rpg.local');

create policy "Mestre atualiza campanhas"
on public.campanhas for update to authenticated
using (mestre_id = auth.uid())
with check (mestre_id = auth.uid());

create policy "Membros veem membros"
on public.campanha_membros for select to authenticated
using (public.eh_membro_da_campanha(campanha_id));

create policy "Mestre gerencia membros"
on public.campanha_membros for all to authenticated
using (public.eh_mestre_da_campanha(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id));

-- =============================================================
-- RLS DOS RECURSOS EXISTENTES
-- =============================================================

alter table public.fichas enable row level security;
alter table public.mapas enable row level security;
alter table public.galeria_imagens enable row level security;

-- FICHAS
 drop policy if exists "Membros leem fichas" on public.fichas;
 drop policy if exists "Usuarios inserem propria ficha" on public.fichas;
 drop policy if exists "Usuarios atualizam propria ficha" on public.fichas;
 drop policy if exists "Membros da campanha leem fichas" on public.fichas;
 drop policy if exists "Jogador salva propria ficha" on public.fichas;
 drop policy if exists "Mestre gerencia fichas da campanha" on public.fichas;

create policy "Membros da campanha leem fichas"
on public.fichas for select to authenticated
using (public.eh_membro_da_campanha(campanha_id));

create policy "Jogador salva propria ficha"
on public.fichas for insert to authenticated
with check (user_id = auth.uid() and public.eh_membro_da_campanha(campanha_id));

create policy "Jogador atualiza propria ficha"
on public.fichas for update to authenticated
using (user_id = auth.uid() and public.eh_membro_da_campanha(campanha_id))
with check (user_id = auth.uid() and public.eh_membro_da_campanha(campanha_id));

create policy "Mestre gerencia fichas da campanha"
on public.fichas for all to authenticated
using (public.eh_mestre_da_campanha(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id));

-- MAPAS
 drop policy if exists "Todos leem mapa" on public.mapas;
 drop policy if exists "Mestre gerencia mapa" on public.mapas;
 drop policy if exists "Membros leem mapas da campanha" on public.mapas;
 drop policy if exists "Mestre gerencia mapas da campanha" on public.mapas;

create policy "Membros leem mapas da campanha"
on public.mapas for select to authenticated
using (public.eh_membro_da_campanha(campanha_id));

create policy "Mestre gerencia mapas da campanha"
on public.mapas for all to authenticated
using (public.eh_mestre_da_campanha(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id));

-- GALERIA: substitui as policies globais da etapa anterior.
 drop policy if exists "Galeria pública para jogadores" on public.galeria_imagens;
 drop policy if exists "Mestre lê toda a galeria" on public.galeria_imagens;
 drop policy if exists "Mestre gerencia galeria" on public.galeria_imagens;
 drop policy if exists "Mestre atualiza galeria" on public.galeria_imagens;
 drop policy if exists "Membros da campanha leem galeria pública" on public.galeria_imagens;
 drop policy if exists "Mestre gerencia galeria da campanha" on public.galeria_imagens;

create policy "Membros da campanha leem galeria pública"
on public.galeria_imagens for select to authenticated
using (public.eh_membro_da_campanha(campanha_id) and publico = true);

create policy "Mestre gerencia galeria da campanha"
on public.galeria_imagens for all to authenticated
using (public.eh_mestre_da_campanha(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id));

-- =============================================================
-- STORAGE: caminho futuro recomendado
-- galeria/<campanha_id>/<pasta>/<arquivo>
-- galeria-privada/<campanha_id>/<pasta>/<arquivo>
-- As policies de storage serão ajustadas na etapa da galeria para aceitar
-- o UUID da campanha no primeiro segmento do caminho.
-- =============================================================

-- IMPORTANTE:
-- Ainda não tornamos campanha_id NOT NULL porque esta migração deve ser
-- executada com o backfill acima e pode ser aplicada sem apagar dados.
-- Após confirmar a migração, podemos endurecer constraints na etapa seguinte.

-- Uma ficha por jogador em cada campanha.
create unique index if not exists ux_fichas_usuario_campanha
  on public.fichas(user_id, campanha_id);

-- =============================================================
-- ETAPA 2 — CONSTRUTOR DE SISTEMAS / FICHAS GENÉRICAS
-- =============================================================
-- A tabela sistemas já foi criada na Etapa 1. Este bloco apenas endurece
-- os campos necessários para o construtor e cria validações básicas.
alter table public.sistemas add column if not exists configuracao jsonb not null default '{}'::jsonb;
create index if not exists idx_sistemas_nome on public.sistemas(lower(nome));

-- Garante que somente o Mestre possa alterar a definição de um sistema.
drop policy if exists "Mestre exclui sistemas" on public.sistemas;
create policy "Mestre exclui sistemas"
on public.sistemas for delete to authenticated
using (lower(coalesce(auth.jwt()->>'email','')) = 'mestre@rpg.local');
