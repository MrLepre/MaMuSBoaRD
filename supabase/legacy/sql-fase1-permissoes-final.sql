-- =============================================================
-- MaMuSBoaRD — FASE 1 — PERMISSÕES FINAIS
--
-- Objetivo:
--   👑 MrLepre = Master Global
--   ⚔️ Guss    = Mestre de Crônicas de Camelot
--   🌙 Kise    = Mestre de Noites Em Tokyo
--   🎲 Demais usuários = jogadores, salvo nas campanhas que criarem
--
-- IMPORTANTE:
-- Execute DEPOIS das migrações antigas de multicampanha, galeria,
-- campanhas, fichas, mapas e módulos. Esta migração é incremental e
-- torna as regras finais coerentes sem apagar dados.
-- =============================================================

-- -------------------------------------------------------------
-- 1. FUNÇÕES DE AUTORIDADE
-- -------------------------------------------------------------
create or replace function public.eh_master_global()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = '74205e44-2c46-42ff-8ad7-4bf1881fc6af'::uuid;
$$;

grant execute on function public.eh_master_global() to authenticated;

create or replace function public.eh_mestre_da_campanha(p_campanha uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.eh_master_global()
      or exists (
        select 1
        from public.campanhas c
        where c.id = p_campanha
          and c.mestre_id = auth.uid()
      );
$$;

grant execute on function public.eh_mestre_da_campanha(uuid) to authenticated;

create or replace function public.eh_membro_da_campanha(p_campanha uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.eh_master_global()
      or exists (
        select 1
        from public.campanha_membros m
        where m.campanha_id = p_campanha
          and m.user_id = auth.uid()
      )
      or exists (
        select 1
        from public.campanhas c
        where c.id = p_campanha
          and c.mestre_id = auth.uid()
      );
$$;

grant execute on function public.eh_membro_da_campanha(uuid) to authenticated;

-- -------------------------------------------------------------
-- 2. CAMPANHAS / MEMBROS / SISTEMAS
-- -------------------------------------------------------------
alter table public.campanhas enable row level security;
alter table public.campanha_membros enable row level security;
alter table public.sistemas enable row level security;

-- Campanhas: todos autenticados podem descobrir; cada usuário cria sua
-- própria campanha; Mestre local e Master Global administram.
drop policy if exists "Campanhas visiveis para autenticados" on public.campanhas;
drop policy if exists "Campanhas descobriveis por autenticados" on public.campanhas;
drop policy if exists "Usuario cria propria campanha" on public.campanhas;
drop policy if exists "Criador gerencia propria campanha" on public.campanhas;
drop policy if exists "Criador apaga propria campanha" on public.campanhas;
drop policy if exists "Mestre ou Master atualiza campanhas" on public.campanhas;
drop policy if exists "Mestre ou Master apaga campanhas" on public.campanhas;

create policy "Campanhas visiveis para autenticados"
on public.campanhas for select to authenticated
using (true);

create policy "Usuario cria propria campanha"
on public.campanhas for insert to authenticated
with check (mestre_id = auth.uid() or public.eh_master_global());

create policy "Mestre ou Master atualiza campanhas"
on public.campanhas for update to authenticated
using (mestre_id = auth.uid() or public.eh_master_global())
with check (mestre_id = auth.uid() or public.eh_master_global());

create policy "Mestre ou Master apaga campanhas"
on public.campanhas for delete to authenticated
using (mestre_id = auth.uid() or public.eh_master_global());

-- Membros: membro lê os vínculos; Mestre local e Master Global gerenciam.
drop policy if exists "Membros veem membros da campanha" on public.campanha_membros;
drop policy if exists "Membros veem membros" on public.campanha_membros;
drop policy if exists "Mestre da campanha gerencia membros" on public.campanha_membros;
drop policy if exists "Mestre ou Master gerencia membros" on public.campanha_membros;

create policy "Membros veem membros da campanha"
on public.campanha_membros for select to authenticated
using (public.eh_membro_da_campanha(campanha_id));

create policy "Mestre ou Master gerencia membros"
on public.campanha_membros for all to authenticated
using (public.eh_mestre_da_campanha(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id));

-- Sistemas: qualquer autenticado pode criar. Criador e Master Global editam.
drop policy if exists "Sistemas visiveis para autenticados" on public.sistemas;
drop policy if exists "Usuario cria sistemas" on public.sistemas;
drop policy if exists "Criador atualiza sistema" on public.sistemas;
drop policy if exists "Criador exclui sistema" on public.sistemas;
drop policy if exists "Criador ou Master atualiza sistema" on public.sistemas;
drop policy if exists "Criador ou Master exclui sistema" on public.sistemas;

create policy "Sistemas visiveis para autenticados"
on public.sistemas for select to authenticated
using (true);

create policy "Usuario cria sistemas"
on public.sistemas for insert to authenticated
with check (criado_por = auth.uid());

create policy "Criador ou Master atualiza sistema"
on public.sistemas for update to authenticated
using (criado_por = auth.uid() or public.eh_master_global())
with check (criado_por = auth.uid() or public.eh_master_global());

create policy "Criador ou Master exclui sistema"
on public.sistemas for delete to authenticated
using (criado_por = auth.uid() or public.eh_master_global());

-- -------------------------------------------------------------
-- 3. FICHAS
-- -------------------------------------------------------------
alter table public.fichas enable row level security;

drop policy if exists "Membros ou Master leem fichas" on public.fichas;
drop policy if exists "Jogador ou Master insere fichas" on public.fichas;
drop policy if exists "Dono ou Master atualiza fichas" on public.fichas;
drop policy if exists "Mestre ou Master exclui fichas" on public.fichas;

create policy "Membros ou Master leem fichas"
on public.fichas for select to authenticated
using (public.eh_membro_da_campanha(campanha_id));

create policy "Jogador ou Master insere fichas"
on public.fichas for insert to authenticated
with check (
  (
    user_id = auth.uid()
    and public.eh_membro_da_campanha(campanha_id)
    and public.eh_campanha_ativa(campanha_id)
  )
  or (
    public.eh_master_global()
    and public.eh_campanha_ativa(campanha_id)
  )
);

create policy "Dono ou Master atualiza fichas"
on public.fichas for update to authenticated
using (
  (
    user_id = auth.uid()
    and public.eh_membro_da_campanha(campanha_id)
    and public.eh_campanha_ativa(campanha_id)
  )
  or (
    public.eh_mestre_da_campanha(campanha_id)
    and public.eh_campanha_ativa(campanha_id)
  )
)
with check (
  (
    user_id = auth.uid()
    and public.eh_membro_da_campanha(campanha_id)
    and public.eh_campanha_ativa(campanha_id)
  )
  or (
    public.eh_mestre_da_campanha(campanha_id)
    and public.eh_campanha_ativa(campanha_id)
  )
);

create policy "Mestre ou Master exclui fichas"
on public.fichas for delete to authenticated
using (public.eh_mestre_da_campanha(campanha_id));

-- -------------------------------------------------------------
-- 4. MAPAS
-- -------------------------------------------------------------
alter table public.mapas enable row level security;

drop policy if exists "Mestre ou Master insere mapas ativos" on public.mapas;
drop policy if exists "Mestre ou Master atualiza mapas ativos" on public.mapas;
drop policy if exists "Mestre ou Master exclui mapas" on public.mapas;

create policy "Mestre ou Master insere mapas ativos"
on public.mapas for insert to authenticated
with check (
  public.eh_mestre_da_campanha(campanha_id)
  and public.eh_campanha_ativa(campanha_id)
);

create policy "Mestre ou Master atualiza mapas ativos"
on public.mapas for update to authenticated
using (
  public.eh_mestre_da_campanha(campanha_id)
  and public.eh_campanha_ativa(campanha_id)
)
with check (
  public.eh_mestre_da_campanha(campanha_id)
  and public.eh_campanha_ativa(campanha_id)
);

create policy "Mestre ou Master exclui mapas"
on public.mapas for delete to authenticated
using (public.eh_mestre_da_campanha(campanha_id));

-- -------------------------------------------------------------
-- 5. GALERIA — METADADOS
-- -------------------------------------------------------------
alter table public.galeria_imagens enable row level security;

drop policy if exists "Membros ou Master leem galeria" on public.galeria_imagens;
drop policy if exists "Membros da campanha leem galeria pública" on public.galeria_imagens;
drop policy if exists "Mestre gerencia galeria da campanha" on public.galeria_imagens;
drop policy if exists "Mestre ou Master insere galeria ativa" on public.galeria_imagens;
drop policy if exists "Mestre ou Master atualiza galeria ativa" on public.galeria_imagens;
drop policy if exists "Mestre ou Master exclui galeria" on public.galeria_imagens;

create policy "Membros da campanha leem galeria pública"
on public.galeria_imagens for select to authenticated
using (
  publico = true
  and public.eh_membro_da_campanha(campanha_id)
);

create policy "Mestre ou Master gerencia galeria"
on public.galeria_imagens for all to authenticated
using (public.eh_mestre_da_campanha(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id));

-- -------------------------------------------------------------
-- 6. NOCTAVELL — corrigir a exceção que ainda verificava mestre_id
-- diretamente e impedia o Master Global.
-- -------------------------------------------------------------
alter table public.noctavell_trabalhos enable row level security;

drop policy if exists "Noctavell membros leem trabalhos" on public.noctavell_trabalhos;
drop policy if exists "Noctavell mestre gerencia trabalhos" on public.noctavell_trabalhos;
drop policy if exists "Noctavell mestre gerencia trabalhos ativos" on public.noctavell_trabalhos;

create policy "Noctavell membros leem trabalhos"
on public.noctavell_trabalhos for select to authenticated
using (public.eh_membro_da_campanha(campanha_id));

create policy "Noctavell mestre gerencia trabalhos"
on public.noctavell_trabalhos for all to authenticated
using (public.eh_mestre_da_campanha(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id));

-- -------------------------------------------------------------
-- 7. MÓDULOS QUE JÁ USAM eh_mestre_da_campanha
-- Não precisam de exceção adicional: a função acima já inclui o Master.
-- -------------------------------------------------------------
-- Economia / Jornais / Calendário / Sessões / Tokens / Pedidos
-- permanecem dependentes das policies próprias existentes.

-- -------------------------------------------------------------
-- 8. STORAGE DA GALERIA
-- Corrige a última herança do antigo mestre@rpg.local.
-- O primeiro segmento do caminho é o campanha_id:
--   <campanha_id>/<pasta>/<arquivo>
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('galeria', 'galeria', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('galeria-privada', 'galeria-privada', false)
on conflict (id) do update set public = false;

drop policy if exists "Mestre envia arquivos da galeria pública" on storage.objects;
drop policy if exists "Mestre envia galeria pública" on storage.objects;
drop policy if exists "Mestre exclui arquivos da galeria pública" on storage.objects;
drop policy if exists "Mestre da campanha envia galeria pública" on storage.objects;
drop policy if exists "Mestre da campanha exclui galeria pública" on storage.objects;
drop policy if exists "Mestre envia galeria privada" on storage.objects;
drop policy if exists "Mestre lê galeria privada" on storage.objects;
drop policy if exists "Mestre exclui arquivos da galeria privada" on storage.objects;
drop policy if exists "Mestre da campanha envia galeria privada" on storage.objects;
drop policy if exists "Mestre da campanha lê galeria privada" on storage.objects;
drop policy if exists "Mestre da campanha exclui galeria privada" on storage.objects;

create policy "Mestre da campanha envia galeria pública"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'galeria'
  and public.eh_mestre_da_campanha(
    nullif(split_part(name, '/', 1), '')::uuid
  )
);

create policy "Mestre da campanha exclui galeria pública"
on storage.objects for delete to authenticated
using (
  bucket_id = 'galeria'
  and public.eh_mestre_da_campanha(
    nullif(split_part(name, '/', 1), '')::uuid
  )
);

create policy "Mestre da campanha envia galeria privada"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'galeria-privada'
  and public.eh_mestre_da_campanha(
    nullif(split_part(name, '/', 1), '')::uuid
  )
);

create policy "Mestre da campanha lê galeria privada"
on storage.objects for select to authenticated
using (
  bucket_id = 'galeria-privada'
  and public.eh_membro_da_campanha(
    nullif(split_part(name, '/', 1), '')::uuid
  )
);

create policy "Mestre da campanha exclui galeria privada"
on storage.objects for delete to authenticated
using (
  bucket_id = 'galeria-privada'
  and public.eh_mestre_da_campanha(
    nullif(split_part(name, '/', 1), '')::uuid
  )
);

-- -------------------------------------------------------------
-- 9. GARANTIR OS MESTRES ATUAIS
-- -------------------------------------------------------------
update public.campanhas
set mestre_id = '35338217-512f-498e-9560-ebdc2a83be49'::uuid,
    updated_at = now()
where lower(trim(nome)) = lower('Noites Em Tokyo');

update public.campanhas
set mestre_id = 'a65baad2-de98-405f-a3b9-6e6e33629baa'::uuid,
    updated_at = now()
where lower(trim(nome)) = lower('Crônicas de Camelot');

update public.campanhas
set mestre_id = '74205e44-2c46-42ff-8ad7-4bf1881fc6af'::uuid,
    updated_at = now()
where lower(trim(nome)) not in (
  lower('Noites Em Tokyo'),
  lower('Crônicas de Camelot')
);

insert into public.campanha_membros (campanha_id, user_id, papel)
select c.id, c.mestre_id, 'mestre'
from public.campanhas c
where c.mestre_id in (
  '74205e44-2c46-42ff-8ad7-4bf1881fc6af'::uuid,
  '35338217-512f-498e-9560-ebdc2a83be49'::uuid,
  'a65baad2-de98-405f-a3b9-6e6e33629baa'::uuid
)
on conflict (campanha_id, user_id)
do update set papel = 'mestre';

-- -------------------------------------------------------------
-- 10. DIAGNÓSTICO FINAL
-- -------------------------------------------------------------
select id, nome, mestre_id, status
from public.campanhas
order by created_at asc;

select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'campanhas','campanha_membros','sistemas','fichas','mapas',
    'galeria_imagens','noctavell_trabalhos'
  )
order by tablename, policyname;

select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname ilike '%galeria%'
order by policyname;

-- Depois de executar, faça o teste funcional entrando separadamente com:
--   MrLepre -> deve administrar todas as campanhas.
--   Guss    -> deve administrar apenas Crônicas de Camelot.
--   Kise    -> deve administrar apenas Noites Em Tokyo.
--   Jogador -> não deve ver controles de Mestre em uma campanha alheia.
