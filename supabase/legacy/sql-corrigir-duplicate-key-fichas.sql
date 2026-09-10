-- MaMuSBoaRD — correção de duplicate key em fichas
-- Executar no SQL Editor do Supabase.
-- Não apaga fichas. Remove apenas índices/constraints UNIQUE legados que
-- impedem um mesmo jogador de possuir uma ficha por campanha.

alter table public.fichas
  add column if not exists campanha_id uuid references public.campanhas(id) on delete cascade;

-- Remove UNIQUE legado somente em user_id ANTES de criar a regra nova.
-- Isso evita que um INSERT/UPDATE ainda seja bloqueado por uma constraint
-- antiga mesmo quando o aplicativo trabalha com user_id + campanha_id.
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

-- Também remove índices UNIQUE legados que usam somente user_id.
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
      join pg_attribute a
        on a.attrelid = t.oid
       and a.attnum = x.attnum
      where x.attnum > 0
    ) cols on true
    where n.nspname = 'public'
      and t.relname = 'fichas'
      and i.indisunique
      and cols.cols = array['user_id']::text[]
      and not exists (
        select 1
        from pg_constraint c
        where c.conrelid = t.oid
          and c.conindid = i.indexrelid
      )
  loop
    execute format('drop index if exists %s', r.index_name);
  end loop;
end $$;

-- Regra correta da arquitetura multicampanha: uma ficha por usuário em cada campanha.
create unique index if not exists ux_fichas_usuario_campanha
  on public.fichas(user_id, campanha_id)
  where campanha_id is not null;

-- Se existirem duplicatas dentro da mesma campanha, não apagamos dados aqui.
-- O índice acima falhará e o banco deverá ser revisado antes de consolidar
-- esses registros. Em uma instalação normal/migrada corretamente, ele cria
-- sem erro.

-- Atualiza o cache do PostgREST imediatamente.
notify pgrst, 'reload schema';
