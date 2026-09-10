-- =============================================================
-- CRÔNICAS DE CAMELOT — GALERIA PROFISSIONAL
-- Pastas + visibilidade + biblioteca do Mestre + imagem para todos.
-- Execute no SQL Editor do Supabase ANTES de publicar esta versão.
-- =============================================================

ALTER TABLE public.galeria_imagens ENABLE ROW LEVEL SECURITY;

-- Metadados da biblioteca.
ALTER TABLE public.galeria_imagens
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

-- Jogadores só consultam imagens marcadas como públicas.
DROP POLICY IF EXISTS "Membros leem galeria" ON public.galeria_imagens;
DROP POLICY IF EXISTS "Galeria pública para jogadores" ON public.galeria_imagens;
DROP POLICY IF EXISTS "Mestre lê toda a galeria" ON public.galeria_imagens;
DROP POLICY IF EXISTS "Membros inserem galeria" ON public.galeria_imagens;
DROP POLICY IF EXISTS "Mestre gerencia galeria" ON public.galeria_imagens;
DROP POLICY IF EXISTS "Mestre atualiza galeria" ON public.galeria_imagens;

CREATE POLICY "Galeria pública para jogadores"
ON public.galeria_imagens FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND publico = true
);

CREATE POLICY "Mestre lê toda a galeria"
ON public.galeria_imagens FOR SELECT
USING (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'mestre@rpg.local'
);

CREATE POLICY "Mestre gerencia galeria"
ON public.galeria_imagens FOR INSERT
WITH CHECK (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'mestre@rpg.local'
);

CREATE POLICY "Mestre atualiza galeria"
ON public.galeria_imagens FOR UPDATE
USING (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'mestre@rpg.local'
)
WITH CHECK (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'mestre@rpg.local'
);

-- =============================================================
-- STORAGE PRIVADO
-- Imagens ocultas NÃO ficam publicamente acessíveis.
-- A Mesa gera uma URL temporária assinada somente quando precisa
-- exibir a imagem ao Mestre ou transmiti-la para a sessão.
-- =============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('galeria-privada', 'galeria-privada', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Mestre envia galeria privada" ON storage.objects;
DROP POLICY IF EXISTS "Mestre lê galeria privada" ON storage.objects;

CREATE POLICY "Mestre envia galeria privada"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'galeria-privada'
  AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'mestre@rpg.local'
);

CREATE POLICY "Mestre lê galeria privada"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'galeria-privada'
  AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'mestre@rpg.local'
);

-- A galeria pública existente continua funcionando.
-- Não removemos as policies atuais do bucket "galeria" para não quebrar
-- imagens antigas, mapas ou outros recursos já publicados.
