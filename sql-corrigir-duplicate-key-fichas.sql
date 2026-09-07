-- MaMuSBoaRD — correção de duplicate key em fichas
-- Executar no SQL Editor do Supabase.
-- Não apaga fichas. Remove apenas índices/constraints UNIQUE legados que
-- impedem um mesmo jogador de possuir uma ficha por campanha.

alter table public.fichas
  add column if not exists campanha_id uuid references public.campanhas(id) on delete cascade;

-- Garante a regra correta da arquitetura multicampanha.
create unique index if not exists ux_fichas_usuario_campanha
  on public.fichas(user_id, campanha_id)
  where campanha_id is not null;

-- Remove UNIQUE antigo que esteja aplicado somente a user_id.
-- Isso é necessário quando o banco veio de uma versão anterior à multicampanha.
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
        join pg_attribute a on a.attrelid = t.oid and a.attnum = x.attnum
      ) = array['user_id']::text[]
  loop
    execute format('alter table public.fichas drop constraint if exists %I', r.conname);
  end loop;
end $$;

-- Também remove índice UNIQUE legado somente em user_id quando ele não é
-- necessário para uma constraint. O índice composto da multicampanha fica.
do $$
declare
  r record;
begin
  for r in
    select i.indexrelid::regclass::text as index_name
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    join lateral (
      select array_agg(a.attname order by x.ord) as cols
      from unnest(i.indkey::int[]) with ordinality x(attnum, ord)
      join pg_attribute a on a.attrelid = t.oid and a.attnum = x.attnum
      where x.attnum > 0
    ) cols on true
    where n.nspname = 'public'
      and t.relname = 'fichas'
      and i.indisunique
      and cols.cols = array['user_id']::text[]
      and i.indexrelid::regclass::text not in (
        select conindid::regclass::text
        from pg_constraint
        where conrelid = t.oid and contype = 'p'
      )
  loop
    execute format('drop index if exists %s', r.index_name);
  end loop;
end $$;

-- Se existirem duplicatas dentro da mesma campanha, não apagamos dados aqui.
-- O índice acima falhará e o banco deverá ser revisado antes de consolidar
-- esses registros. Em uma instalação normal/migrada corretamente, ele cria
-- sem erro.
