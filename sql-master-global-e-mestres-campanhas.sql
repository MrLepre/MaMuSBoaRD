-- =============================================================
-- MaMuSBoaRD — MASTER GLOBAL + MESTRES DAS CAMPANHAS
--
-- Master global: MrLepre
-- ID: 74205e44-2c46-42ff-8ad7-4bf1881fc6af
-- Email: mrlepre@rpg.local
--
-- Mestres locais:
--   Noites em Tokyo  -> Kise
--   Crônicas de Camelot -> Guss
--
-- Execute DEPOIS das migrações de multicampanha/RLS existentes.
-- =============================================================

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

-- O Master global tem autoridade de Mestre sobre qualquer campanha.
create or replace function public.eh_mestre_da_campanha(p_campanha uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.eh_master_global()
      or exists (
        select 1 from public.campanhas c
        where c.id = p_campanha and c.mestre_id = auth.uid()
      );
$$;

grant execute on function public.eh_mestre_da_campanha(uuid) to authenticated;

-- Para leitura administrativa, o Master global pode enxergar todos os
-- vínculos/dados das campanhas sem precisar ser adicionado como jogador.
-- Isso não muda o papel dos jogadores nem o mestre_id das campanhas.
create or replace function public.eh_membro_da_campanha(p_campanha uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.eh_master_global()
      or exists (
        select 1 from public.campanha_membros m
        where m.campanha_id = p_campanha and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.campanhas c
        where c.id = p_campanha and c.mestre_id = auth.uid()
      );
$$;

grant execute on function public.eh_membro_da_campanha(uuid) to authenticated;

-- =============================================================
-- CAMPANHAS
-- Qualquer autenticado continua podendo criar a própria campanha.
-- O Master global pode administrar qualquer campanha.
-- =============================================================

alter table public.campanhas enable row level security;

drop policy if exists "Campanhas visiveis para autenticados" on public.campanhas;
drop policy if exists "Usuario cria propria campanha" on public.campanhas;
drop policy if exists "Criador gerencia propria campanha" on public.campanhas;
drop policy if exists "Criador apaga propria campanha" on public.campanhas;
drop policy if exists "Mestre apaga campanhas" on public.campanhas;
drop policy if exists "Mestre atualiza campanhas" on public.campanhas;

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

-- =============================================================
-- MEMBROS / PEDIDOS
-- =============================================================

alter table public.campanha_membros enable row level security;

drop policy if exists "Membros veem membros da campanha" on public.campanha_membros;
drop policy if exists "Mestre da campanha gerencia membros" on public.campanha_membros;
drop policy if exists "Mestre gerencia membros" on public.campanha_membros;

create policy "Membros veem membros da campanha"
on public.campanha_membros for select to authenticated
using (public.eh_membro_da_campanha(campanha_id));

create policy "Mestre ou Master gerencia membros"
on public.campanha_membros for all to authenticated
using (public.eh_mestre_da_campanha(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id));

-- =============================================================
-- SISTEMAS
-- Qualquer autenticado cria. O criador edita/exclui; o Master global
-- também pode editar/excluir qualquer sistema.
-- =============================================================

alter table public.sistemas enable row level security;

drop policy if exists "Sistemas visiveis para autenticados" on public.sistemas;
drop policy if exists "Usuario cria sistemas" on public.sistemas;
drop policy if exists "Criador atualiza sistema" on public.sistemas;
drop policy if exists "Criador exclui sistema" on public.sistemas;

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

-- =============================================================
-- REAPLICAÇÃO DAS POLICIES DE RECURSOS
-- As policies que usam eh_mestre_da_campanha passam a aceitar
-- automaticamente o Master global por causa da função acima.
-- Estas regras garantem também que o Master global possa ler/administrar
-- recursos mesmo sem vínculo de jogador.
-- =============================================================

-- FICHAS
alter table public.fichas enable row level security;
drop policy if exists "Membros da campanha leem fichas" on public.fichas;
drop policy if exists "Jogador salva propria ficha" on public.fichas;
drop policy if exists "Jogador atualiza propria ficha" on public.fichas;
drop policy if exists "Mestre insere atualiza fichas ativas" on public.fichas;
drop policy if exists "Mestre atualiza fichas ativas" on public.fichas;
drop policy if exists "Mestre exclui fichas" on public.fichas;
create policy "Membros ou Master leem fichas" on public.fichas for select to authenticated
using (public.eh_membro_da_campanha(campanha_id));
create policy "Jogador ou Master insere fichas" on public.fichas for insert to authenticated
with check ((user_id = auth.uid() and public.eh_membro_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id)) or (public.eh_master_global() and public.eh_campanha_ativa(campanha_id)));
create policy "Dono ou Master atualiza fichas" on public.fichas for update to authenticated
using ((user_id = auth.uid() and public.eh_membro_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id)) or (public.eh_master_global() and public.eh_campanha_ativa(campanha_id)))
with check ((user_id = auth.uid() and public.eh_membro_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id)) or (public.eh_master_global() and public.eh_campanha_ativa(campanha_id)));
create policy "Mestre ou Master exclui fichas" on public.fichas for delete to authenticated
using (public.eh_mestre_da_campanha(campanha_id));

-- MAPAS
alter table public.mapas enable row level security;
drop policy if exists "Mestre insere atualiza mapas ativos" on public.mapas;
drop policy if exists "Mestre atualiza mapas ativos" on public.mapas;
drop policy if exists "Mestre exclui mapas" on public.mapas;
create policy "Mestre ou Master insere mapas ativos" on public.mapas for insert to authenticated
with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));
create policy "Mestre ou Master atualiza mapas ativos" on public.mapas for update to authenticated
using (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));
create policy "Mestre ou Master exclui mapas" on public.mapas for delete to authenticated
using (public.eh_mestre_da_campanha(campanha_id));

-- GALERIA
alter table public.galeria_imagens enable row level security;
drop policy if exists "Mestre insere galeria ativa" on public.galeria_imagens;
drop policy if exists "Mestre atualiza galeria ativa" on public.galeria_imagens;
drop policy if exists "Mestre exclui galeria" on public.galeria_imagens;
create policy "Mestre ou Master insere galeria ativa" on public.galeria_imagens for insert to authenticated
with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));
create policy "Mestre ou Master atualiza galeria ativa" on public.galeria_imagens for update to authenticated
using (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));
create policy "Mestre ou Master exclui galeria" on public.galeria_imagens for delete to authenticated
using (public.eh_mestre_da_campanha(campanha_id));

-- =============================================================
-- VÍNCULOS DOS MESTRES LOCAIS
-- Não cria campanhas novas: apenas assume as campanhas já existentes.
-- =============================================================

-- Noites em Tokyo -> Kise
update public.campanhas c
set mestre_id = '35338217-512f-498e-9560-ebdc2a83be49'::uuid,
    updated_at = now()
where lower(trim(c.nome)) = lower('Noites em Tokyo');

insert into public.campanha_membros (campanha_id, user_id, papel)
select c.id, '35338217-512f-498e-9560-ebdc2a83be49'::uuid, 'mestre'
from public.campanhas c
where lower(trim(c.nome)) = lower('Noites em Tokyo')
on conflict (campanha_id, user_id) do update set papel = 'mestre';

-- Crônicas de Camelot -> Guss
update public.campanhas c
set mestre_id = 'a65baad2-de98-405f-a3b9-6e6e33629baa'::uuid,
    updated_at = now()
where lower(trim(c.nome)) = lower('Crônicas de Camelot');

insert into public.campanha_membros (campanha_id, user_id, papel)
select c.id, 'a65baad2-de98-405f-a3b9-6e6e33629baa'::uuid, 'mestre'
from public.campanhas c
where lower(trim(c.nome)) = lower('Crônicas de Camelot')
on conflict (campanha_id, user_id) do update set papel = 'mestre';

-- =============================================================
-- DEMAIS CAMPANHAS -> MASTER GLOBAL (MrLepre)
-- Todas as campanhas já existentes, exceto as duas campanhas com
-- mestres locais acima, passam a ter MrLepre como mestre da campanha.
-- Não cria campanhas novas.
-- =============================================================

update public.campanhas c
set mestre_id = '74205e44-2c46-42ff-8ad7-4bf1881fc6af'::uuid,
    updated_at = now()
where lower(trim(c.nome)) not in (
  lower('Noites em Tokyo'),
  lower('Crônicas de Camelot')
);

insert into public.campanha_membros (campanha_id, user_id, papel)
select c.id, '74205e44-2c46-42ff-8ad7-4bf1881fc6af'::uuid, 'mestre'
from public.campanhas c
where lower(trim(c.nome)) not in (
  lower('Noites em Tokyo'),
  lower('Crônicas de Camelot')
)
on conflict (campanha_id, user_id) do update set papel = 'mestre';

-- =============================================================
-- DIAGNÓSTICO OPCIONAL
-- Se quiser conferir antes/depois:
-- select id,nome,mestre_id from public.campanhas
-- order by created_at;
-- =============================================================
