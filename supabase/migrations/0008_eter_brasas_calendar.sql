-- MaMuSBoaRD canonical migration
-- Source consolidated from the historical project SQL.

-- ÉTER & BRASAS — CALENDÁRIO DAS BRASAS
-- 10 meses x 36 dias + 5 Dias Livres. Um calendário por campanha.
create table if not exists public.calendario_campanha (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null unique references public.campanhas(id) on delete cascade,
  ano integer not null default 1 check (ano >= 1),
  dia_do_ano integer not null default 1 check (dia_do_ano between 1 and 365),
  atualizado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_calendario_campanha on public.calendario_campanha(campanha_id);
alter table public.calendario_campanha enable row level security;
drop policy if exists "Membros leem calendario" on public.calendario_campanha;
drop policy if exists "Mestre gerencia calendario" on public.calendario_campanha;
create policy "Membros leem calendario" on public.calendario_campanha for select using (public.eh_membro_da_campanha(campanha_id));
create policy "Mestre gerencia calendario" on public.calendario_campanha for all using (public.eh_mestre_da_campanha(campanha_id)) with check (public.eh_mestre_da_campanha(campanha_id));
create or replace function public.atualizar_updated_at_calendario() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists trg_calendario_updated_at on public.calendario_campanha;
create trigger trg_calendario_updated_at before update on public.calendario_campanha for each row execute function public.atualizar_updated_at_calendario();
insert into public.calendario_campanha (campanha_id,ano,dia_do_ano)
select c.id,1,1 from public.campanhas c join public.sistemas s on s.id=c.sistema_id
where s.configuracao->>'tipo'='eter_brasas'
and not exists (select 1 from public.calendario_campanha cc where cc.campanha_id=c.id);
