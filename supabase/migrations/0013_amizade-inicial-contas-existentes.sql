-- MaMuSBoaRD — Marco 11.1 — Amizade inicial
-- Regra única de bootstrap: todas as contas existentes no momento desta migration
-- passam a ser amigas entre si.
-- Contas criadas depois desta migration NÃO entram automaticamente nesta regra.

insert into public.amizades (user_a, user_b)
select least(a.id, b.id), greatest(a.id, b.id)
from auth.users a
join auth.users b on a.id < b.id
on conflict (user_a, user_b) do nothing;
