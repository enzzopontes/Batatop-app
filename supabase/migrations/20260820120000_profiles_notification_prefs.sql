-- Preferências de notificação do usuário (app/profile/gerenciar-notificacoes.js)
--
-- A tela "Gerenciar notificações" salva essas 5 colunas na tabela profiles.
-- Nenhuma existia até aqui — por isso o toggle de promoção estourava com
-- PGRST204 ("Could not find the 'notify_promo_push' column of 'profiles'").
-- IF NOT EXISTS deixa a migration idempotente (rodar de novo não dá erro).
--
-- Defaults:
--   notify_orders_push = true  (avisos de pedido são importantes, ligado por padrão)
--   notify_promo_*     = false (promoção é opt-in, desligado por padrão)

alter table public.profiles
  add column if not exists notify_orders_push boolean not null default true,
  add column if not exists notify_promo_push boolean not null default false,
  add column if not exists notify_promo_email boolean not null default false,
  add column if not exists notify_promo_whatsapp boolean not null default false,
  add column if not exists notify_promo_sms boolean not null default false;