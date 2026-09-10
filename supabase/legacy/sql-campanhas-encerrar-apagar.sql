-- =============================================================
-- CAMPANHAS — ENCERRAR / APAGAR COM SEGURANÇA
-- Execute depois das migrações multicampanha.
-- =============================================================

alter table public.campanhas
  add column if not exists status text not null default 'ativa'
  check (status in ('ativa','encerrada'));

alter table public.campanhas
  add column if not exists encerrada_at timestamptz;

create index if not exists idx_campanhas_status on public.campanhas(status);

create or replace function public.eh_campanha_ativa(p_campanha uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.campanhas c
    where c.id = p_campanha and c.status = 'ativa'
  );
$$;

grant execute on function public.eh_campanha_ativa(uuid) to authenticated;

-- Somente o Mestre pode apagar a própria campanha.
drop policy if exists "Mestre apaga campanhas" on public.campanhas;
create policy "Mestre apaga campanhas"
on public.campanhas for delete to authenticated
using (mestre_id = auth.uid());

-- Atualização normal só pode manter/usar uma campanha ativa.
-- O encerramento é permitido pelo Mestre; depois de encerrada ela fica congelada.
drop policy if exists "Mestre atualiza campanhas" on public.campanhas;
create policy "Mestre atualiza campanhas"
on public.campanhas for update to authenticated
using (mestre_id = auth.uid())
with check (mestre_id = auth.uid());

-- Jogadores continuam podendo consultar campanhas encerradas, mas não recebem
-- novos vínculos nelas.
drop policy if exists "Mestre gerencia membros" on public.campanha_membros;
create policy "Mestre gerencia membros"
on public.campanha_membros for all to authenticated
using (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));

-- Fichas: leitura permanece disponível; alterações ficam bloqueadas após encerramento.
drop policy if exists "Jogador salva propria ficha" on public.fichas;
create policy "Jogador salva propria ficha"
on public.fichas for insert to authenticated
with check (user_id = auth.uid() and public.eh_membro_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));

drop policy if exists "Jogador atualiza propria ficha" on public.fichas;
create policy "Jogador atualiza propria ficha"
on public.fichas for update to authenticated
using (user_id = auth.uid() and public.eh_membro_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id))
with check (user_id = auth.uid() and public.eh_membro_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));

drop policy if exists "Mestre gerencia fichas da campanha" on public.fichas;
create policy "Mestre gerencia fichas da campanha"
on public.fichas for all to authenticated
using (public.eh_mestre_da_campanha(campanha_id) and (public.eh_campanha_ativa(campanha_id) or true))
with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));

-- A policy acima preserva DELETE para o Mestre em campanha encerrada, mas bloqueia
-- INSERT/UPDATE pelo WITH CHECK. Para ficar inequívoco, o DELETE é separado abaixo.
drop policy if exists "Mestre gerencia fichas da campanha" on public.fichas;
create policy "Mestre insere atualiza fichas ativas"
on public.fichas for insert to authenticated
with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));
create policy "Mestre atualiza fichas ativas"
on public.fichas for update to authenticated
using (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));
create policy "Mestre exclui fichas"
on public.fichas for delete to authenticated
using (public.eh_mestre_da_campanha(campanha_id));

-- Mapas: jogadores só leem; Mestre altera enquanto ativa e pode apagar sempre.
drop policy if exists "Mestre gerencia mapas da campanha" on public.mapas;
create policy "Mestre insere atualiza mapas ativos"
on public.mapas for insert to authenticated
with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));
create policy "Mestre atualiza mapas ativos"
on public.mapas for update to authenticated
using (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));
create policy "Mestre exclui mapas"
on public.mapas for delete to authenticated
using (public.eh_mestre_da_campanha(campanha_id));

-- Galeria: leitura preservada; escrita bloqueada após encerramento, exclusão permitida.
drop policy if exists "Mestre gerencia galeria da campanha" on public.galeria_imagens;
create policy "Mestre insere galeria ativa"
on public.galeria_imagens for insert to authenticated
with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));
create policy "Mestre atualiza galeria ativa"
on public.galeria_imagens for update to authenticated
using (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));
create policy "Mestre exclui galeria"
on public.galeria_imagens for delete to authenticated
using (public.eh_mestre_da_campanha(campanha_id));

-- Noctavell / Economia / Jornais: também ficam somente leitura após encerramento.
drop policy if exists "Noctavell mestre gerencia trabalhos" on public.noctavell_trabalhos;
create policy "Noctavell mestre gerencia trabalhos ativos"
on public.noctavell_trabalhos for all to authenticated
using (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));

do $$
begin
  if to_regclass('public.economia_mercados') is not null then
    drop policy if exists "Mestre gerencia mercados" on public.economia_mercados;
    create policy "Mestre gerencia mercados ativos" on public.economia_mercados for all
      using (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id))
      with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));
  end if;
  if to_regclass('public.economia_itens') is not null then
    drop policy if exists "Mestre gerencia mercadorias" on public.economia_itens;
    create policy "Mestre gerencia mercadorias ativas" on public.economia_itens for all
      using (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id))
      with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));
  end if;
  if to_regclass('public.economia_eventos') is not null then
    drop policy if exists "Mestre gerencia eventos economia" on public.economia_eventos;
    create policy "Mestre gerencia eventos economia ativos" on public.economia_eventos for all
      using (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id))
      with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));
  end if;
  if to_regclass('public.jornais_campanha') is not null then
    drop policy if exists "Mestre gerencia jornais" on public.jornais_campanha;
    create policy "Mestre gerencia jornais ativos" on public.jornais_campanha for all
      using (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id))
      with check (public.eh_mestre_da_campanha(campanha_id) and public.eh_campanha_ativa(campanha_id));
  end if;
end $$;

-- Encerrar é definitivo: não permite reabrir uma campanha encerrada.
create or replace function public.impedir_reabertura_campanha()
returns trigger language plpgsql as $$
begin
  if old.status = 'encerrada' and new.status <> 'encerrada' then
    raise exception 'Campanha encerrada não pode ser reaberta.';
  end if;
  if new.status = 'encerrada' and old.status <> 'encerrada' and new.encerrada_at is null then
    new.encerrada_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_impedir_reabertura_campanha on public.campanhas;
create trigger trg_impedir_reabertura_campanha
before update on public.campanhas
for each row execute function public.impedir_reabertura_campanha();
