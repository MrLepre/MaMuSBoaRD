-- CRÔNICAS DE CAMELOT — SESSÕES + DIÁRIOS
-- Migração incremental. Não apaga dados existentes.

create table if not exists public.sessoes_campanha (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  numero integer not null,
  nome text not null default '',
  status text not null default 'aberta' check (status in ('aberta','encerrada')),
  iniciada_em timestamptz not null default now(),
  encerrada_em timestamptz,
  iniciada_por uuid references auth.users(id) on delete set null,
  total_rolagens integer not null default 0,
  total_diarios integer not null default 0,
  created_at timestamptz not null default now(),
  unique (campanha_id, numero)
);

create unique index if not exists sessoes_campanha_uma_aberta
  on public.sessoes_campanha(campanha_id)
  where status = 'aberta';

create table if not exists public.sessao_rolagens (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.sessoes_campanha(id) on delete cascade,
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  nick text not null default 'Jogador',
  descricao text not null default '',
  resultado text not null default '',
  criado_em timestamptz not null default now()
);

create index if not exists sessao_rolagens_sessao_idx on public.sessao_rolagens(sessao_id, criado_em);

create table if not exists public.sessao_diarios (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.sessoes_campanha(id) on delete cascade,
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  autor_nick text not null default 'Jogador',
  titulo text not null default 'Registro da sessão',
  conteudo text not null default '',
  imagens jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique(sessao_id, user_id)
);

create index if not exists sessao_diarios_campanha_idx on public.sessao_diarios(campanha_id, atualizado_em desc);

alter table public.sessoes_campanha enable row level security;
alter table public.sessao_rolagens enable row level security;
alter table public.sessao_diarios enable row level security;

-- Leitura: membros da campanha. O Mestre também é membro pela regra de acesso já existente.
drop policy if exists "Membros leem sessoes" on public.sessoes_campanha;
create policy "Membros leem sessoes" on public.sessoes_campanha for select using (public.eh_membro_da_campanha(campanha_id));

drop policy if exists "Mestre gerencia sessoes" on public.sessoes_campanha;
create policy "Mestre gerencia sessoes" on public.sessoes_campanha for all using (public.eh_mestre_da_campanha(campanha_id)) with check (public.eh_mestre_da_campanha(campanha_id));

drop policy if exists "Membros leem rolagens da sessao" on public.sessao_rolagens;
create policy "Membros leem rolagens da sessao" on public.sessao_rolagens for select using (public.eh_membro_da_campanha(campanha_id));

drop policy if exists "Membros registram rolagens na sessao aberta" on public.sessao_rolagens;
create policy "Membros registram rolagens na sessao aberta" on public.sessao_rolagens for insert with check (
  public.eh_membro_da_campanha(campanha_id)
  and exists (select 1 from public.sessoes_campanha s where s.id=sessao_id and s.campanha_id=sessao_rolagens.campanha_id and s.status='aberta')
  and (user_id = auth.uid() or user_id is null)
);

drop policy if exists "Membros leem diarios da sessao" on public.sessao_diarios;
create policy "Dono ou Mestre leem diarios da sessao" on public.sessao_diarios for select using (user_id = auth.uid() or public.eh_mestre_da_campanha(campanha_id));

drop policy if exists "Jogador cria ou atualiza proprio diario" on public.sessao_diarios;
create policy "Jogador cria ou atualiza proprio diario" on public.sessao_diarios for insert with check (
  public.eh_membro_da_campanha(campanha_id)
  and user_id = auth.uid()
  and exists (select 1 from public.sessoes_campanha s where s.id=sessao_id and s.campanha_id=sessao_diarios.campanha_id and s.status='aberta')
);

drop policy if exists "Jogador atualiza proprio diario" on public.sessao_diarios;
create policy "Jogador atualiza proprio diario" on public.sessao_diarios for update using (
  user_id = auth.uid() and public.eh_membro_da_campanha(campanha_id)
) with check (
  user_id = auth.uid() and public.eh_membro_da_campanha(campanha_id)
  and exists (select 1 from public.sessoes_campanha s where s.id=sessao_id and s.campanha_id=sessao_diarios.campanha_id and s.status='aberta')
);

drop policy if exists "Mestre gerencia diarios" on public.sessao_diarios;
create policy "Mestre gerencia diarios" on public.sessao_diarios for all using (public.eh_mestre_da_campanha(campanha_id)) with check (public.eh_mestre_da_campanha(campanha_id));

-- Bucket privado para imagens dos diários.
insert into storage.buckets (id, name, public)
values ('sessao-notas', 'sessao-notas', false)
on conflict (id) do nothing;

-- Usuários autenticados só podem gravar imagens no próprio diretório:
-- <campanha_id>/<sessao_id>/<user_id>/arquivo.ext
-- A validação de campanha/sessão é reforçada pelas tabelas; a política limita o primeiro nível ao formato UUID.
drop policy if exists "Membros enviam imagens de diario" on storage.objects;
create policy "Membros enviam imagens de diario" on storage.objects
for insert to authenticated
with check (
  bucket_id='sessao-notas'
  and (storage.foldername(name))[3] = auth.uid()::text
  and public.eh_membro_da_campanha((storage.foldername(name))[1]::uuid)
);

drop policy if exists "Membros leem imagens de diario" on storage.objects;
create policy "Dono ou Mestre leem imagens de diario" on storage.objects
for select to authenticated
using (
  bucket_id='sessao-notas'
  and (
    (storage.foldername(name))[3] = auth.uid()::text
    or public.eh_mestre_da_campanha((storage.foldername(name))[1]::uuid)
  )
);

drop policy if exists "Membros removem propria imagem de diario" on storage.objects;
create policy "Membros removem propria imagem de diario" on storage.objects
for delete to authenticated
using (
  bucket_id='sessao-notas'
  and (storage.foldername(name))[3] = auth.uid()::text
);

-- O Mestre da campanha pode remover qualquer imagem da campanha.
drop policy if exists "Mestre remove imagens de diario" on storage.objects;
create policy "Mestre remove imagens de diario" on storage.objects
for delete to authenticated
using (
  bucket_id='sessao-notas'
  and public.eh_mestre_da_campanha((storage.foldername(name))[1]::uuid)
);

