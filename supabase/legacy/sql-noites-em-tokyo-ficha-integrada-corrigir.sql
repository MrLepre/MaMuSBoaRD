-- MaMuSBoaRD — correção definitiva de fichas por campanha
-- Execute no SQL Editor do Supabase.
-- Não apaga fichas. Corrige a estrutura UNIQUE legada e prepara a multicampanha.

alter table public.fichas
  add column if not exists campanha_id uuid references public.campanhas(id) on delete cascade;

-- 1) Remove UNIQUE legado somente em user_id.
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
        join pg_attribute a on a.attrelid=t.oid and a.attnum=x.attnum
      ) = array['user_id']::text[]
  loop
    execute format('alter table public.fichas drop constraint if exists %I', r.conname);
  end loop;
end $$;

-- 2) Remove índice UNIQUE legado somente em user_id.
do $$
declare
  r record;
begin
  for r in
    select i.indexrelid::regclass::text as index_name
    from pg_index i
    join pg_class t on t.oid=i.indrelid
    join pg_namespace n on n.oid=t.relnamespace
    join lateral (
      select array_agg(a.attname order by x.ord) as cols
      from unnest(i.indkey::int[]) with ordinality x(attnum, ord)
      join pg_attribute a on a.attrelid=t.oid and a.attnum=x.attnum
      where x.attnum > 0
    ) cols on true
    where n.nspname='public'
      and t.relname='fichas'
      and i.indisunique
      and cols.cols=array['user_id']::text[]
      and not exists (select 1 from pg_constraint c where c.conrelid=t.oid and c.conindid=i.indexrelid)
  loop
    execute format('drop index if exists %s', r.index_name);
  end loop;
end $$;

-- 3) Regra correta: uma ficha por jogador em cada campanha.
create unique index if not exists ux_fichas_usuario_campanha
  on public.fichas(user_id, campanha_id)
  where campanha_id is not null;

-- 4) Atualiza o cache do PostgREST.
notify pgrst, 'reload schema';
