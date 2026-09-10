-- =============================================================
-- CORREÇÃO — CRÔNICAS DE CAMELOT / SISTEMA NÃO ENCONTRADO
-- Execute no SQL Editor do Supabase.
-- Não apaga fichas, mapas, galerias ou campanhas.
-- =============================================================

create extension if not exists pgcrypto;

-- 1) Garante que o sistema legado exista.
insert into public.sistemas (nome, descricao, configuracao, criado_por)
select
  'Crônicas de Camelot',
  'Sistema original da campanha Crônicas de Camelot.',
  jsonb_build_object(
    'tipo', 'legado',
    'dados', jsonb_build_array('d4','d6','d8','d10','d12','d20','d100'),
    'ficha', 'ficha-editor.html'
  ),
  u.id
from auth.users u
where lower(coalesce(u.email,'')) = 'mestre@rpg.local'
  and not exists (
    select 1 from public.sistemas s
    where lower(s.nome) = lower('Crônicas de Camelot')
  );

-- 2) Se já existir, garante que a configuração continue apontando
-- para a ficha legada.
update public.sistemas
set configuracao = coalesce(configuracao, '{}'::jsonb)
  || jsonb_build_object('tipo','legado','ficha','ficha-editor.html'),
    updated_at = now()
where lower(nome) = lower('Crônicas de Camelot');

-- 3) Vincula a campanha original ao sistema correto.
update public.campanhas c
set sistema_id = s.id,
    updated_at = now()
from public.sistemas s
where lower(c.nome) = lower('Crônicas de Camelot')
  and lower(s.nome) = lower('Crônicas de Camelot')
  and (c.sistema_id is distinct from s.id);

-- 4) Mostra o resultado para conferência.
select
  c.id as campanha_id,
  c.nome as campanha,
  c.sistema_id,
  s.id as sistema_id,
  s.nome as sistema,
  s.configuracao->>'tipo' as tipo_ficha,
  s.configuracao->>'ficha' as arquivo_ficha
from public.campanhas c
left join public.sistemas s on s.id = c.sistema_id
where lower(c.nome) = lower('Crônicas de Camelot');
