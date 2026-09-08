-- MaMuSBoaRD — correção definitiva de fichas por campanha
-- Execute no SQL Editor do Supabase.
-- Não apaga fichas.

alter table public.fichas
  add column if not exists campanha_id uuid references public.campanhas(id) on delete cascade;

-- Regra correta: uma ficha por usuário em cada campanha.
create unique index if not exists ux_fichas_usuario_campanha
  on public.fichas(user_id, campanha_id)
  where campanha_id is not null;

-- Remove constraints UNIQUE antigas que aceitam apenas user_id.
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'fichas'
      and c.contype = 'u'
      and (
        select array_agg(a.attname order by x.ord)
        from unnest(c.conkey) with ordinality x(attnum, ord)
        join pg_attribute a
          on a.attrelid = t.oid
         and a.attnum = x.attnum
      ) = array['user_id']::text[]
  loop
    execute format('alter table public.fichas drop constraint if exists %I', r.conname);
  end loop;
end $$;

-- Observação:
-- O app.js agora faz SELECT -> UPDATE/INSERT e não depende
-- exclusivamente de upsert/onConflict para funcionar.
