-- =============================================================
-- CRÔNICAS DE CAMELOT — CORREÇÃO DA GALERIA POR CAMPANHA
-- Corrige upload, exibição e RLS da Biblioteca Visual.
-- Migração incremental: não apaga imagens nem registros existentes.
-- Execute no SQL Editor do Supabase.
-- =============================================================

ALTER TABLE public.galeria_imagens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.galeria_imagens
  ADD COLUMN IF NOT EXISTS campanha_id uuid REFERENCES public.campanhas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS nome text,
  ADD COLUMN IF NOT EXISTS pasta text NOT NULL DEFAULT 'Geral',
  ADD COLUMN IF NOT EXISTS publico boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS criado_por uuid;

UPDATE public.galeria_imagens
SET pasta = COALESCE(NULLIF(pasta, ''), NULLIF(categoria, ''), 'Geral')
WHERE pasta IS NULL OR pasta = '';

UPDATE public.galeria_imagens
SET nome = COALESCE(NULLIF(nome, ''), 'Imagem da campanha')
WHERE nome IS NULL OR nome = '';

-- =============================================================
-- METADADOS / RLS
-- =============================================================

DROP POLICY IF EXISTS "Galeria pública para jogadores" ON public.galeria_imagens;
DROP POLICY IF EXISTS "Mestre lê toda a galeria" ON public.galeria_imagens;
DROP POLICY IF EXISTS "Mestre gerencia galeria" ON public.galeria_imagens;
DROP POLICY IF EXISTS "Mestre atualiza galeria" ON public.galeria_imagens;
DROP POLICY IF EXISTS "Mestre exclui galeria da campanha" ON public.galeria_imagens;
DROP POLICY IF EXISTS "Membros da campanha leem galeria pública" ON public.galeria_imagens;
DROP POLICY IF EXISTS "Mestre gerencia galeria da campanha" ON public.galeria_imagens;

-- Jogadores só veem imagens públicas da campanha em que possuem acesso.
CREATE POLICY "Membros da campanha leem galeria pública"
ON public.galeria_imagens FOR SELECT TO authenticated
USING (
  publico = true
  AND campanha_id IS NOT NULL
  AND public.eh_membro_da_campanha(campanha_id)
);

-- O Mestre vê e gerencia somente os recursos da campanha que ele mestra.
CREATE POLICY "Mestre gerencia galeria da campanha"
ON public.galeria_imagens FOR ALL TO authenticated
USING (public.eh_mestre_da_campanha(campanha_id))
WITH CHECK (public.eh_mestre_da_campanha(campanha_id));

-- =============================================================
-- STORAGE PÚBLICO
-- A aplicação grava em:
-- galeria/<campanha_id>/<pasta>/<arquivo>
-- O bucket precisa ser público para getPublicUrl funcionar para jogadores.
-- =============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('galeria', 'galeria', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Mestre envia arquivos da galeria pública" ON storage.objects;
DROP POLICY IF EXISTS "Mestre envia galeria pública" ON storage.objects;
DROP POLICY IF EXISTS "Membros leem arquivos da galeria" ON storage.objects;
DROP POLICY IF EXISTS "Mestre exclui arquivos da galeria pública" ON storage.objects;

CREATE POLICY "Mestre envia arquivos da galeria pública"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'galeria'
  AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'mestre@rpg.local'
);

-- A leitura pública é dada pelo próprio bucket público. Esta policy também
-- permite que usuários autenticados consultem os objetos quando necessário.
CREATE POLICY "Membros leem arquivos da galeria"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'galeria');

CREATE POLICY "Mestre exclui arquivos da galeria pública"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'galeria'
  AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'mestre@rpg.local'
);

-- =============================================================
-- STORAGE PRIVADO
-- =============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('galeria-privada', 'galeria-privada', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Mestre envia galeria privada" ON storage.objects;
DROP POLICY IF EXISTS "Mestre lê galeria privada" ON storage.objects;
DROP POLICY IF EXISTS "Mestre exclui arquivos da galeria privada" ON storage.objects;

CREATE POLICY "Mestre envia galeria privada"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'galeria-privada'
  AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'mestre@rpg.local'
);

CREATE POLICY "Mestre lê galeria privada"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'galeria-privada'
  AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'mestre@rpg.local'
);

CREATE POLICY "Mestre exclui arquivos da galeria privada"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'galeria-privada'
  AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'mestre@rpg.local'
);

-- =============================================================
-- OBSERVAÇÃO SOBRE IMAGENS ANTIGAS
-- Registros antigos sem campanha_id continuam no banco, mas não são
-- associados automaticamente a uma campanha. Isso evita misturar recursos
-- entre mesas. As novas imagens sempre recebem campanha_id.
-- =============================================================
