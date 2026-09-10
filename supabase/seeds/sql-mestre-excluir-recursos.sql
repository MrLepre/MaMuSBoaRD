-- =============================================================
-- MESTRE — EXCLUSÃO DE FICHAS E IMAGENS DA BIBLIOTECA
-- Execute no SQL Editor do Supabase.
-- Não apaga dados automaticamente: apenas libera a exclusão pelo Mestre.
-- =============================================================

-- FICHAS
-- A política de campanha da Etapa 1 já cobre DELETE quando o usuário
-- é o Mestre da campanha. Esta policy é mantida explícita para instalações
-- que ainda estejam com uma versão anterior das policies.
DROP POLICY IF EXISTS "Mestre exclui fichas da campanha" ON public.fichas;
CREATE POLICY "Mestre exclui fichas da campanha"
ON public.fichas FOR DELETE TO authenticated
USING (public.eh_mestre_da_campanha(campanha_id));

-- GALERIA — metadados
DROP POLICY IF EXISTS "Mestre exclui galeria da campanha" ON public.galeria_imagens;
CREATE POLICY "Mestre exclui galeria da campanha"
ON public.galeria_imagens FOR DELETE TO authenticated
USING (public.eh_mestre_da_campanha(campanha_id));

-- STORAGE — imagens públicas
DROP POLICY IF EXISTS "Mestre exclui arquivos da galeria pública" ON storage.objects;
CREATE POLICY "Mestre exclui arquivos da galeria pública"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'galeria'
  AND lower(coalesce(auth.jwt() ->> 'email','')) = 'mestre@rpg.local'
);

-- STORAGE — imagens ocultas
DROP POLICY IF EXISTS "Mestre exclui arquivos da galeria privada" ON storage.objects;
CREATE POLICY "Mestre exclui arquivos da galeria privada"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'galeria-privada'
  AND lower(coalesce(auth.jwt() ->> 'email','')) = 'mestre@rpg.local'
);
