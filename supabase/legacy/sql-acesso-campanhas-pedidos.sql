-- =============================================================
-- ACESSO ÀS CAMPANHAS POR SOLICITAÇÃO
-- Permite descobrir campanhas sem conceder acesso aos dados.
-- Execute depois de sql-multicampanha-etapa1.sql.
-- =============================================================

create table if not exists public.campanha_pedidos (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente','aceito','recusado','cancelado')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_campanha_pedidos_campanha on public.campanha_pedidos(campanha_id);
create index if not exists idx_campanha_pedidos_usuario on public.campanha_pedidos(user_id);
create unique index if not exists ux_campanha_pedido_pendente
  on public.campanha_pedidos(campanha_id, user_id)
  where status = 'pendente';

alter table public.campanha_pedidos enable row level security;

-- A descoberta é pública apenas para usuários autenticados; isso não dá
-- acesso a fichas/mapas/galeria porque essas tabelas continuam protegidas
-- por eh_membro_da_campanha().
drop policy if exists "Campanhas descobriveis por autenticados" on public.campanhas;
create policy "Campanhas descobriveis por autenticados"
on public.campanhas for select to authenticated
using (true);

-- Cada jogador pode criar e consultar somente seus próprios pedidos.
drop policy if exists "Usuario cria proprio pedido" on public.campanha_pedidos;
create policy "Usuario cria proprio pedido"
on public.campanha_pedidos for insert to authenticated
with check (user_id = auth.uid() and status = 'pendente');

drop policy if exists "Usuario ve proprios pedidos" on public.campanha_pedidos;
create policy "Usuario ve proprios pedidos"
on public.campanha_pedidos for select to authenticated
using (user_id = auth.uid() or public.eh_mestre_da_campanha(campanha_id));

-- Somente o Mestre da campanha pode aceitar, recusar ou cancelar pedidos.
drop policy if exists "Mestre resolve pedidos" on public.campanha_pedidos;
create policy "Mestre resolve pedidos"
on public.campanha_pedidos for update to authenticated
using (public.eh_mestre_da_campanha(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id));

-- Ao aceitar, o pedido deve gerar o membro. A operação é feita pelo painel
-- usando a função abaixo, que executa de forma atômica.
create or replace function public.resolver_pedido_campanha(
  p_pedido uuid,
  p_aceitar boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campanha uuid;
  v_user uuid;
begin
  select campanha_id, user_id into v_campanha, v_user
  from public.campanha_pedidos
  where id = p_pedido and status = 'pendente';

  if v_campanha is null or not public.eh_mestre_da_campanha(v_campanha) then
    raise exception 'Sem permissão ou pedido inexistente';
  end if;

  if p_aceitar then
    insert into public.campanha_membros(campanha_id, user_id, papel)
    values (v_campanha, v_user, 'jogador')
    on conflict (campanha_id, user_id) do update set papel = excluded.papel;
  end if;

  update public.campanha_pedidos
  set status = case when p_aceitar then 'aceito' else 'recusado' end,
      resolved_at = now(),
      resolved_by = auth.uid()
  where id = p_pedido;

  return true;
end;
$$;

grant execute on function public.resolver_pedido_campanha(uuid, boolean) to authenticated;
