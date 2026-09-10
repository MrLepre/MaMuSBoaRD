-- MaMuSBoaRD canonical migration
-- Source consolidated from the historical project SQL.


-- NOCTAVELL: quadro de trabalhos e cenas por campanha
create table if not exists public.noctavell_trabalhos (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  titulo text not null,
  grau text not null default 'I',
  descricao text default '',
  recompensa text default '',
  penalidade text default '',
  prazo text default '',
  status text not null default 'aberto' check (status in ('aberto','aceito','concluido','recusado','falhado')),
  criado_por uuid references auth.users(id) on delete set null,
  aceito_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.noctavell_trabalhos enable row level security;

drop policy if exists "Noctavell membros leem trabalhos" on public.noctavell_trabalhos;
create policy "Noctavell membros leem trabalhos" on public.noctavell_trabalhos for select to authenticated
using (exists(select 1 from public.campanha_membros cm where cm.campanha_id=noctavell_trabalhos.campanha_id and cm.user_id=auth.uid()));

drop policy if exists "Noctavell mestre gerencia trabalhos" on public.noctavell_trabalhos;
create policy "Noctavell mestre gerencia trabalhos" on public.noctavell_trabalhos for all to authenticated
using (exists(select 1 from public.campanhas c where c.id=noctavell_trabalhos.campanha_id and c.mestre_id=auth.uid()))
with check (exists(select 1 from public.campanhas c where c.id=noctavell_trabalhos.campanha_id and c.mestre_id=auth.uid()));

create index if not exists idx_noctavell_trabalhos_campanha on public.noctavell_trabalhos(campanha_id);
