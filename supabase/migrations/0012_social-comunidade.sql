-- MaMuSBoaRD — Marco 11 — Comunidade RPG
-- Perfis, amizades e descoberta de mesas.

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text not null default 'Jogador',
  bio text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint perfis_username_format check (username ~ '^[a-z0-9_]{3,32}$'),
  constraint perfis_display_name_length check (char_length(display_name) between 1 and 80),
  constraint perfis_bio_length check (char_length(bio) <= 240)
);
create unique index if not exists ux_perfis_username_lower on public.perfis(lower(username));
create index if not exists idx_perfis_display_name on public.perfis(display_name);

create or replace function public.criar_perfil_usuario()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_display text; v_base text; v_username text; v_n integer:=0;
begin
  v_display:=coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Jogador');
  v_base:=lower(regexp_replace(v_display,'[^a-zA-Z0-9_]+','_','g'));
  v_base:=regexp_replace(v_base,'^_+|_+$','','g');
  v_base:=left(coalesce(nullif(v_base,''),'jogador'),24);
  v_username:=v_base;
  while exists(select 1 from public.perfis where lower(username)=lower(v_username)) loop
    v_n:=v_n+1; v_username:=left(v_base,24-length(v_n::text)-1)||'_'||v_n::text;
  end loop;
  insert into public.perfis(id,username,display_name) values(new.id,v_username,left(v_display,80)) on conflict(id) do nothing;
  return new;
end;
$$;

do $$ begin
  if not exists(select 1 from pg_trigger where tgname='trg_criar_perfil_usuario') then
    create trigger trg_criar_perfil_usuario after insert on auth.users for each row execute function public.criar_perfil_usuario();
  end if;
end $$;

do $$
declare r record; v_display text; v_base text; v_username text; v_n integer;
begin
  for r in select id,raw_user_meta_data from auth.users loop
    if not exists(select 1 from public.perfis where id=r.id) then
      v_display:=coalesce(nullif(trim(r.raw_user_meta_data->>'display_name'),''),'Jogador');
      v_base:=lower(regexp_replace(v_display,'[^a-zA-Z0-9_]+','_','g'));
      v_base:=regexp_replace(v_base,'^_+|_+$','','g'); v_base:=left(coalesce(nullif(v_base,''),'jogador'),24);
      v_username:=v_base; v_n:=0;
      while exists(select 1 from public.perfis where lower(username)=lower(v_username)) loop
        v_n:=v_n+1; v_username:=left(v_base,24-length(v_n::text)-1)||'_'||v_n::text;
      end loop;
      insert into public.perfis(id,username,display_name) values(r.id,v_username,left(v_display,80));
    end if;
  end loop;
end $$;

alter table public.perfis enable row level security;
drop policy if exists "Perfis publicos para autenticados" on public.perfis;
create policy "Perfis publicos para autenticados" on public.perfis for select to authenticated using(true);
drop policy if exists "Usuario atualiza proprio perfil" on public.perfis;
create policy "Usuario atualiza proprio perfil" on public.perfis for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
drop policy if exists "Usuario insere proprio perfil" on public.perfis;
create policy "Usuario insere proprio perfil" on public.perfis for insert to authenticated with check(id=auth.uid());

create table if not exists public.solicitacoes_amizade (
  id uuid primary key default gen_random_uuid(),
  de_usuario uuid not null references auth.users(id) on delete cascade,
  para_usuario uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pendente' check(status in ('pendente','aceita','recusada','cancelada')),
  created_at timestamptz not null default now(), resolved_at timestamptz,
  constraint solicitacao_amizade_nao_auto check(de_usuario<>para_usuario)
);
create unique index if not exists ux_solicitacao_amizade_pendente on public.solicitacoes_amizade(de_usuario,para_usuario) where status='pendente';
create index if not exists idx_solicitacoes_amizade_para on public.solicitacoes_amizade(para_usuario,status);

create table if not exists public.amizades (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint amizade_nao_auto check(user_a<>user_b),
  constraint amizade_ordem check(user_a<user_b),
  unique(user_a,user_b)
);
create index if not exists idx_amizades_a on public.amizades(user_a);
create index if not exists idx_amizades_b on public.amizades(user_b);

alter table public.solicitacoes_amizade enable row level security;
alter table public.amizades enable row level security;
drop policy if exists "Usuario ve solicitacoes de amizade" on public.solicitacoes_amizade;
create policy "Usuario ve solicitacoes de amizade" on public.solicitacoes_amizade for select to authenticated using(de_usuario=auth.uid() or para_usuario=auth.uid());
drop policy if exists "Usuario envia solicitacao de amizade" on public.solicitacoes_amizade;
create policy "Usuario envia solicitacao de amizade" on public.solicitacoes_amizade for insert to authenticated with check(de_usuario=auth.uid() and status='pendente');
drop policy if exists "Usuario atualiza solicitacao de amizade" on public.solicitacoes_amizade;
create policy "Usuario atualiza solicitacao de amizade" on public.solicitacoes_amizade for update to authenticated using(de_usuario=auth.uid() or para_usuario=auth.uid()) with check(de_usuario=auth.uid() or para_usuario=auth.uid());
drop policy if exists "Usuario ve suas amizades" on public.amizades;
create policy "Usuario ve suas amizades" on public.amizades for select to authenticated using(user_a=auth.uid() or user_b=auth.uid());

create or replace function public.resolver_solicitacao_amizade(p_solicitacao uuid,p_aceitar boolean)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_de uuid; v_para uuid; v_status text; v_a uuid; v_b uuid;
begin
  select de_usuario,para_usuario,status into v_de,v_para,v_status from public.solicitacoes_amizade where id=p_solicitacao for update;
  if v_de is null or v_para is null or v_status<>'pendente' or v_para<>auth.uid() then raise exception 'Solicitacao inexistente ou sem permissao'; end if;
  if p_aceitar then
    v_a:=least(v_de,v_para); v_b:=greatest(v_de,v_para);
    insert into public.amizades(user_a,user_b) values(v_a,v_b) on conflict(user_a,user_b) do nothing;
  end if;
  update public.solicitacoes_amizade set status=case when p_aceitar then 'aceita' else 'recusada' end,resolved_at=now() where id=p_solicitacao;
  return true;
end;
$$;
grant execute on function public.resolver_solicitacao_amizade(uuid,boolean) to authenticated;

-- Publicacao controlada de campanhas para descoberta da comunidade.
alter table public.campanhas add column if not exists publica boolean not null default false;
alter table public.campanhas add column if not exists procurando_jogadores boolean not null default false;
alter table public.campanhas add column if not exists vagas_jogadores integer not null default 0;
alter table public.campanhas add column if not exists horario_texto text not null default '';
do $$ begin
  if not exists(select 1 from pg_constraint where conname='campanhas_vagas_nonnegative') then
    alter table public.campanhas add constraint campanhas_vagas_nonnegative check(vagas_jogadores>=0);
  end if;
end $$;
create index if not exists idx_campanhas_descoberta on public.campanhas(publica,procurando_jogadores,status,created_at desc);
