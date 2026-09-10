-- =============================================================
-- MaMuSBoaRD — MESTRE POR CAMPANHA / SEM PERFIL MESTRE GLOBAL
-- Execute depois das migrações de multicampanha existentes.
-- =============================================================

alter table public.sistemas
  add column if not exists criado_por uuid references auth.users(id) on delete set null;
create index if not exists idx_sistemas_criado_por on public.sistemas(criado_por);

-- CAMPANHAS: qualquer autenticado pode criar; o criador é o Mestre local.
alter table public.campanhas enable row level security;
drop policy if exists "Membros veem campanhas" on public.campanhas;
drop policy if exists "Mestre cria campanhas" on public.campanhas;
drop policy if exists "Mestre atualiza campanhas" on public.campanhas;
drop policy if exists "Campanhas descobriveis por autenticados" on public.campanhas;
drop policy if exists "Campanhas visiveis para autenticados" on public.campanhas;
drop policy if exists "Usuario cria propria campanha" on public.campanhas;
drop policy if exists "Criador gerencia propria campanha" on public.campanhas;
drop policy if exists "Criador apaga propria campanha" on public.campanhas;
create policy "Campanhas visiveis para autenticados"
on public.campanhas for select to authenticated using (true);
create policy "Usuario cria propria campanha"
on public.campanhas for insert to authenticated with check (mestre_id = auth.uid());
create policy "Criador gerencia propria campanha"
on public.campanhas for update to authenticated using (mestre_id = auth.uid()) with check (mestre_id = auth.uid());
create policy "Criador apaga propria campanha"
on public.campanhas for delete to authenticated using (mestre_id = auth.uid());

-- MEMBROS: o Mestre da campanha administra os jogadores.
alter table public.campanha_membros enable row level security;
drop policy if exists "Membros veem membros" on public.campanha_membros;
drop policy if exists "Mestre gerencia membros" on public.campanha_membros;
drop policy if exists "Membros veem membros da campanha" on public.campanha_membros;
drop policy if exists "Mestre da campanha gerencia membros" on public.campanha_membros;
drop policy if exists "Criador cria proprio vinculo de mestre" on public.campanha_membros;
create policy "Membros veem membros da campanha"
on public.campanha_membros for select to authenticated using (public.eh_membro_da_campanha(campanha_id));
create policy "Mestre da campanha gerencia membros"
on public.campanha_membros for all to authenticated
using (public.eh_mestre_da_campanha(campanha_id))
with check (public.eh_mestre_da_campanha(campanha_id));

-- SISTEMAS: qualquer autenticado cria. Só o criador edita/exclui.
alter table public.sistemas enable row level security;
drop policy if exists "Mestre cria sistemas" on public.sistemas;
drop policy if exists "Mestre atualiza sistemas" on public.sistemas;
drop policy if exists "Mestre exclui sistemas" on public.sistemas;
drop policy if exists "Usuario cria sistemas" on public.sistemas;
drop policy if exists "Criador atualiza sistema" on public.sistemas;
drop policy if exists "Criador exclui sistema" on public.sistemas;
drop policy if exists "Sistemas visiveis para autenticados" on public.sistemas;
create policy "Sistemas visiveis para autenticados"
on public.sistemas for select to authenticated using (true);
create policy "Usuario cria sistemas"
on public.sistemas for insert to authenticated with check (criado_por = auth.uid());
create policy "Criador atualiza sistema"
on public.sistemas for update to authenticated using (criado_por = auth.uid()) with check (criado_por = auth.uid());
create policy "Criador exclui sistema"
on public.sistemas for delete to authenticated using (criado_por = auth.uid());

-- STORAGE DA GALERIA: o app usa <campanha_id>/<pasta>/<arquivo>.
-- Assim o Mestre local pode publicar/remover arquivos da própria campanha.
drop policy if exists "Mestre envia arquivos da galeria pública" on storage.objects;
drop policy if exists "Mestre lê toda a galeria" on public.galeria_imagens;
drop policy if exists "Mestre gerencia galeria" on public.galeria_imagens;
drop policy if exists "Mestre atualiza galeria" on public.galeria_imagens;
drop policy if exists "Mestre gerencia galeria" on public.galeria_imagens;
drop policy if exists "Mestre exclui galeria" on public.galeria_imagens;
drop policy if exists "Mestre exclui arquivos da galeria pública" on storage.objects;
drop policy if exists "Mestre envia galeria privada" on storage.objects;
drop policy if exists "Mestre lê galeria privada" on storage.objects;
drop policy if exists "Mestre exclui arquivos da galeria privada" on storage.objects;
drop policy if exists "Mestre da campanha envia galeria pública" on storage.objects;
drop policy if exists "Mestre da campanha exclui galeria pública" on storage.objects;
drop policy if exists "Mestre da campanha envia galeria privada" on storage.objects;
drop policy if exists "Mestre da campanha lê galeria privada" on storage.objects;
drop policy if exists "Mestre da campanha exclui galeria privada" on storage.objects;
create policy "Mestre da campanha envia galeria pública"
on storage.objects for insert to authenticated
with check (bucket_id = 'galeria' and public.eh_mestre_da_campanha(nullif(split_part(name, '/', 1), '')::uuid));
create policy "Mestre da campanha exclui galeria pública"
on storage.objects for delete to authenticated
using (bucket_id = 'galeria' and public.eh_mestre_da_campanha(nullif(split_part(name, '/', 1), '')::uuid));
create policy "Mestre da campanha envia galeria privada"
on storage.objects for insert to authenticated
with check (bucket_id = 'galeria-privada' and public.eh_mestre_da_campanha(nullif(split_part(name, '/', 1), '')::uuid));
create policy "Mestre da campanha lê galeria privada"
on storage.objects for select to authenticated
using (bucket_id = 'galeria-privada' and (public.eh_mestre_da_campanha(nullif(split_part(name, '/', 1), '')::uuid) or public.eh_membro_da_campanha(nullif(split_part(name, '/', 1), '')::uuid)));
create policy "Mestre da campanha exclui galeria privada"
on storage.objects for delete to authenticated
using (bucket_id = 'galeria-privada' and public.eh_mestre_da_campanha(nullif(split_part(name, '/', 1), '')::uuid));

-- Não há nenhuma regra de autorização baseada em mestre@rpg.local nesta migração.
