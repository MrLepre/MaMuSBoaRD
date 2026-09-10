-- =============================================================
-- MaMuSBoaRD — FASE 1 / ESTABILIZAÇÃO
--
-- Objetivo: validar e corrigir os vínculos de mestres sem depender
-- de nomes específicos de policies existentes no banco.
-- Esta migration NÃO apaga/recria RLS.
-- =============================================================

-- 1) Garantir os mestres locais conhecidos.
UPDATE public.campanhas
SET mestre_id = '35338217-512f-498e-9560-ebdc2a83be49'::uuid,
    updated_at = now()
WHERE lower(trim(nome)) = lower('Noites Em Tokyo');

UPDATE public.campanhas
SET mestre_id = 'a65baad2-de98-405f-a3b9-6e6e33629baa'::uuid,
    updated_at = now()
WHERE lower(trim(nome)) = lower('Crônicas de Camelot');

-- 2) Demais campanhas existentes ficam sob o Master Global.
UPDATE public.campanhas
SET mestre_id = '74205e44-2c46-42ff-8ad7-4bf1881fc6af'::uuid,
    updated_at = now()
WHERE lower(trim(nome)) NOT IN (
  lower('Noites Em Tokyo'),
  lower('Crônicas de Camelot')
);

-- 3) Garantir os vínculos explícitos dos mestres locais/global.
INSERT INTO public.campanha_membros (campanha_id, user_id, papel)
SELECT id, '35338217-512f-498e-9560-ebdc2a83be49'::uuid, 'mestre'
FROM public.campanhas
WHERE lower(trim(nome)) = lower('Noites Em Tokyo')
ON CONFLICT (campanha_id, user_id) DO UPDATE SET papel = 'mestre';

INSERT INTO public.campanha_membros (campanha_id, user_id, papel)
SELECT id, 'a65baad2-de98-405f-a3b9-6e6e33629baa'::uuid, 'mestre'
FROM public.campanhas
WHERE lower(trim(nome)) = lower('Crônicas de Camelot')
ON CONFLICT (campanha_id, user_id) DO UPDATE SET papel = 'mestre';

INSERT INTO public.campanha_membros (campanha_id, user_id, papel)
SELECT id, '74205e44-2c46-42ff-8ad7-4bf1881fc6af'::uuid, 'mestre'
FROM public.campanhas
WHERE lower(trim(nome)) NOT IN (
  lower('Noites Em Tokyo'),
  lower('Crônicas de Camelot')
)
ON CONFLICT (campanha_id, user_id) DO UPDATE SET papel = 'mestre';

-- 4) Diagnóstico das policies atuais.
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('campanhas','campanha_membros','fichas','mapas','galeria_imagens')
ORDER BY tablename, policyname;

-- 5) Diagnóstico final dos mestres.
SELECT id, nome, mestre_id, status
FROM public.campanhas
ORDER BY nome;
