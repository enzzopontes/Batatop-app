-- 027_parity_lgpd_loyalty_min_order.sql
-- Paridade App <-> Site + Hardening AppSec:
-- 1. LGPD: tabela account_deletion_requests + RPC request_account_deletion (identificador mascarado, limpeza completa)
-- 2. Fidelidade server-side: get_loyalty_status, process_order_loyalty (trigger em delivered), redeem_loyalty_reward + trava de titularidade e teto de 1 batata base
-- 3. Pedido mínimo R$ 20,00 somente para delivery + avaliação de horário America/Sao_Paulo + permissões estritas REVOKE/GRANT

-- ============================================================
-- 1. LGPD: Protocolos de exclusão/anonimização de conta
-- ============================================================
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  protocol text NOT NULL UNIQUE,
  identifier text,
  reason text,
  source text NOT NULL DEFAULT 'site',
  status text NOT NULL DEFAULT 'processed',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_user_id
  ON public.account_deletion_requests (user_id);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_deletion_requests_select_own ON public.account_deletion_requests;
CREATE POLICY account_deletion_requests_select_own
  ON public.account_deletion_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE OR REPLACE FUNCTION public.request_account_deletion(
  p_reason text DEFAULT NULL,
  p_source text DEFAULT 'app',
  p_identifier text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_protocol text;
  v_source text := CASE WHEN lower(COALESCE(p_source, '')) IN ('app', 'site') THEN lower(p_source) ELSE 'app' END;
  v_reason text := NULLIF(left(btrim(COALESCE(p_reason, '')), 500), '');
  v_raw_id text := NULLIF(left(btrim(COALESCE(p_identifier, '')), 160), '');
  v_masked_id text;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  v_masked_id := CASE
    WHEN v_raw_id IS NULL THEN NULL
    WHEN position('@' in v_raw_id) > 2 THEN left(v_raw_id, 2) || '***@' || split_part(v_raw_id, '@', 2)
    WHEN length(v_raw_id) > 4 THEN '***' || right(v_raw_id, 4)
    ELSE '***'
  END;

  v_protocol := 'LGPD-EXC-' || upper(to_hex(extract(epoch FROM v_now)::bigint)) || '-' || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');

  -- Remove dados pessoais não fiscais e tokens
  DELETE FROM public.addresses WHERE user_id = v_uid;
  DELETE FROM public.payment_cards WHERE user_id = v_uid;
  DELETE FROM public.user_push_tokens WHERE user_id = v_uid;
  DELETE FROM public.admin_push_tokens WHERE user_id = v_uid;
  DELETE FROM public.notification_reads WHERE user_id = v_uid;
  DELETE FROM public.loyalty_rewards WHERE user_id = v_uid;

  -- Anonimiza perfil preservando integridade referencial fiscal de pedidos
  UPDATE public.profiles
     SET full_name = 'Usuário Excluído / Anonimizado',
         phone = NULL,
         cpf = NULL,
         loyalty_orders_count = 0,
         notify_orders_push = false,
         notify_promo_push = false,
         notify_promo_email = false,
         notify_promo_whatsapp = false,
         notify_promo_sms = false,
         updated_at = v_now
   WHERE id = v_uid;

  INSERT INTO public.account_deletion_requests (
    user_id, protocol, identifier, reason, source, status, created_at, processed_at
  ) VALUES (
    v_uid, v_protocol, v_masked_id, v_reason, v_source, 'pending_auth_ban', v_now, v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'protocol', v_protocol,
    'status', 'pending_auth_ban',
    'processed_at', v_now
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.request_account_deletion(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(text, text, text) TO authenticated, service_role;

-- ============================================================
-- 2. FIDELIDADE SERVER-SIDE COMPARTILHADA (APP + SITE)
-- ============================================================
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS loyalty_orders_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_rewards_claimed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_last_reward_at timestamptz;

ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS loyalty_counted boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.loyalty_rewards (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  cycle_number integer NOT NULL DEFAULT 1,
  reward_type text NOT NULL DEFAULT 'free_batata',
  coupon_code text,
  claimed boolean NOT NULL DEFAULT false,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_user_id ON public.loyalty_rewards (user_id);

ALTER TABLE public.loyalty_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver suas próprias recompensas" ON public.loyalty_rewards;
CREATE POLICY "Usuários podem ver suas próprias recompensas"
  ON public.loyalty_rewards FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar resgate da recompensa" ON public.loyalty_rewards;

-- Oculta cupons pessoais FIDELIDADE-% da listagem pública de cupons para terceiros
DROP POLICY IF EXISTS "Anyone can view active coupons" ON public.coupons;
CREATE POLICY "Anyone can view active coupons"
  ON public.coupons FOR SELECT TO public
  USING (
    active = true
    AND (
      upper(code) NOT LIKE 'FIDELIDADE-%'
      OR public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.loyalty_rewards lr
         WHERE upper(lr.coupon_code) = upper(coupons.code)
           AND lr.user_id = auth.uid()
      )
    )
  );

CREATE OR REPLACE FUNCTION public.process_order_loyalty(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_order record;
  v_current_count integer;
  v_new_count integer;
  v_reward_unlocked boolean := false;
  v_cutoff constant timestamptz := '2026-11-07T13:40:00Z'::timestamptz;
BEGIN
  -- Bloqueia chamada direta por cliente; permite execução via trigger (pg_trigger_depth() > 0), admin ou service_role
  IF pg_trigger_depth() = 0
     AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     AND SESSION_USER NOT IN ('postgres', 'supabase_admin')
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT id, user_id, status, loyalty_counted, created_at
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
  END IF;

  IF v_order.user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_user');
  END IF;

  IF v_order.created_at < v_cutoff THEN
    RETURN jsonb_build_object('success', false, 'error', 'before_cutoff');
  END IF;

  IF COALESCE(v_order.loyalty_counted, false) IS TRUE THEN
    RETURN jsonb_build_object('success', true, 'already_counted', true);
  END IF;

  IF lower(COALESCE(v_order.status, '')) NOT IN ('delivered', 'concluído', 'concluido') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_delivered');
  END IF;

  SELECT COALESCE(loyalty_orders_count, 0)
    INTO v_current_count
    FROM public.profiles
   WHERE id = v_order.user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  v_new_count := LEAST(10, v_current_count + 1);
  v_reward_unlocked := (v_new_count >= 10);

  UPDATE public.orders
     SET loyalty_counted = true
   WHERE id = p_order_id;

  UPDATE public.profiles
     SET loyalty_orders_count = v_new_count,
         updated_at = now()
   WHERE id = v_order.user_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_count', v_new_count,
    'reward_unlocked', v_reward_unlocked
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.process_order_loyalty(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_order_loyalty(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_fn_orders_loyalty_on_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF lower(COALESCE(NEW.status, '')) IN ('delivered', 'concluído', 'concluido')
     AND lower(COALESCE(OLD.status, '')) IS DISTINCT FROM lower(COALESCE(NEW.status, ''))
     AND COALESCE(NEW.loyalty_counted, false) IS NOT TRUE THEN
    PERFORM public.process_order_loyalty(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_fn_orders_loyalty_on_delivered() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_fn_orders_loyalty_on_delivered() TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_orders_loyalty_on_delivered'
  ) THEN
    CREATE TRIGGER trg_orders_loyalty_on_delivered
      AFTER UPDATE OF status ON public.orders
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_fn_orders_loyalty_on_delivered();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_loyalty_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := 0;
  v_claimed integer := 0;
  v_history jsonb := '[]'::jsonb;
  v_active_code text := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'orders_count', 0,
      'target_orders', 10,
      'remaining_orders', 10,
      'has_reward_available', false,
      'rewards_claimed_count', 0,
      'active_reward_code', NULL,
      'history', '[]'::jsonb
    );
  END IF;

  SELECT LEAST(10, GREATEST(0, COALESCE(loyalty_orders_count, 0))),
         GREATEST(0, COALESCE(loyalty_rewards_claimed, 0))
    INTO v_count, v_claimed
    FROM public.profiles
   WHERE id = v_uid;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'code', r.coupon_code,
      'claimed', r.claimed,
      'claimedAt', r.claimed_at,
      'createdAt', r.created_at
    ) ORDER BY r.created_at DESC
  ), '[]'::jsonb)
    INTO v_history
    FROM (
      SELECT id, coupon_code, claimed, claimed_at, created_at
        FROM public.loyalty_rewards
       WHERE user_id = v_uid
       ORDER BY created_at DESC
       LIMIT 20
    ) r;

  SELECT lr.coupon_code
    INTO v_active_code
    FROM public.loyalty_rewards lr
    JOIN public.coupons c ON upper(c.code) = upper(lr.coupon_code)
   WHERE lr.user_id = v_uid
     AND c.active IS TRUE
     AND COALESCE(c.current_uses, 0) < COALESCE(c.max_uses, 1)
     AND (c.expires_at IS NULL OR c.expires_at > now())
   ORDER BY lr.created_at DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'orders_count', COALESCE(v_count, 0),
    'target_orders', 10,
    'remaining_orders', GREATEST(0, 10 - COALESCE(v_count, 0)),
    'has_reward_available', COALESCE(v_count, 0) >= 10,
    'rewards_claimed_count', COALESCE(v_claimed, 0),
    'active_reward_code', v_active_code,
    'history', v_history
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_loyalty_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_loyalty_status() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.redeem_loyalty_reward()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := 0;
  v_claimed integer := 0;
  v_code text;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(loyalty_orders_count, 0), COALESCE(loyalty_rewards_claimed, 0)
    INTO v_count, v_claimed
    FROM public.profiles
   WHERE id = v_uid
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF v_count < 10 THEN
    RAISE EXCEPTION 'loyalty_not_enough_orders';
  END IF;

  v_code := 'FIDELIDADE-' || upper(substr(md5(v_uid::text || clock_timestamp()::text || random()::text), 1, 6));

  INSERT INTO public.coupons (
    code,
    description,
    discount_type,
    discount_value,
    min_order_value,
    max_uses,
    max_uses_per_user,
    current_uses,
    active,
    expires_at,
    restricted_categories
  ) VALUES (
    v_code,
    'Recompensa Fidelidade: 1 Batata Grátis (1 unidade base)',
    'percentage',
    100,
    0,
    1,
    1,
    0,
    true,
    v_now + interval '30 days',
    ARRAY['batata', 'batatas']
  );

  INSERT INTO public.loyalty_rewards (
    user_id, cycle_number, reward_type, coupon_code, claimed, claimed_at, created_at
  ) VALUES (
    v_uid, v_claimed + 1, 'free_batata', v_code, true, v_now, v_now
  );

  UPDATE public.profiles
     SET loyalty_orders_count = 0,
         loyalty_rewards_claimed = v_claimed + 1,
         loyalty_last_reward_at = v_now,
         updated_at = v_now
   WHERE id = v_uid;

  RETURN jsonb_build_object(
    'success', true,
    'coupon_code', v_code,
    'orders_count', 0,
    'rewards_claimed_count', v_claimed + 1
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.redeem_loyalty_reward() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_reward() TO authenticated, service_role;

-- ============================================================
-- 3. HELPER DE HORÁRIO DA LOJA (America/Sao_Paulo) + create_order
-- ============================================================
CREATE OR REPLACE FUNCTION public.evaluate_store_is_open(p_store jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_is_open boolean := COALESCE((p_store->>'isOpen')::boolean, true);
  v_auto boolean := COALESCE((p_store->>'autoSchedule')::boolean, true);
  v_override boolean := COALESCE((p_store->>'manualOverride')::boolean, false);
  v_last_cycle boolean;
  v_open_str text := COALESCE(NULLIF(p_store->>'openTime', ''), '10:00');
  v_close_str text := COALESCE(NULLIF(p_store->>'closeTime', ''), '22:00');
  v_now_sp time := (now() AT TIME ZONE 'America/Sao_Paulo')::time;
  v_cur_min int := extract(hour FROM v_now_sp)::int * 60 + extract(minute FROM v_now_sp)::int;
  v_open_min int;
  v_close_min int;
  v_scheduled_open boolean;
BEGIN
  IF p_store IS NULL THEN
    RETURN true;
  END IF;

  IF NOT v_auto THEN
    RETURN v_is_open;
  END IF;

  BEGIN
    v_open_min := split_part(v_open_str, ':', 1)::int * 60 + split_part(v_open_str, ':', 2)::int;
    v_close_min := split_part(v_close_str, ':', 1)::int * 60 + split_part(v_close_str, ':', 2)::int;
  EXCEPTION WHEN OTHERS THEN
    RETURN v_is_open;
  END;

  IF v_open_min <= v_close_min THEN
    v_scheduled_open := (v_cur_min >= v_open_min AND v_cur_min < v_close_min);
  ELSE
    v_scheduled_open := (v_cur_min >= v_open_min OR v_cur_min < v_close_min);
  END IF;

  IF v_override THEN
    IF jsonb_typeof(p_store->'lastCycleState') = 'boolean' THEN
      v_last_cycle := (p_store->>'lastCycleState')::boolean;
      IF v_scheduled_open IS DISTINCT FROM v_last_cycle THEN
        RETURN v_scheduled_open;
      END IF;
    END IF;
    RETURN v_is_open;
  END IF;

  RETURN v_scheduled_open;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.evaluate_store_is_open(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_store_is_open(jsonb) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_order(
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_customer_neighborhood text,
  p_customer_complement text,
  p_delivery_type text,
  p_payment_method text,
  p_payment_online boolean,
  p_coupon_code text,
  p_notes text,
  p_wants_cutlery boolean,
  p_metadata jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_store jsonb;
  v_fee numeric := 0;
  v_item_promo boolean := false;
  v_super_on boolean := false;
  v_super_price numeric;
  v_legacy_on boolean := false;
  v_legacy_price numeric := 24.99;
  v_promos jsonb := '[]'::jsonb;
  v_cnt int;
  v_item jsonb;
  v_prod record;
  v_qty int;
  v_price numeric;
  v_promo numeric;
  v_addon jsonb;
  v_addon_id uuid;
  v_addon_name text;
  v_addon_qty int;
  v_adic record;
  v_addons_sum numeric;
  v_addons_json jsonb;
  v_item_total numeric;
  v_subtotal numeric := 0;
  v_rows jsonb := '[]'::jsonb;
  v_row jsonb;
  v_has_coupon boolean := false;
  v_coupon_pending boolean := false;
  v_coupon record;
  v_coupon_id uuid;
  v_coupon_code text;
  v_uses int;
  v_prior_orders int;
  v_eligible numeric := 0;
  v_discount numeric := 0;
  v_total numeric;
  v_status text;
  v_number int;
  v_today date;
  v_order_id uuid;
  v_safe_input_meta jsonb := '{}'::jsonb;
  v_meta jsonb;
  v_online boolean := COALESCE(p_payment_online, false);
  v_pay_method text := p_payment_method;
  v_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_del_lat double precision;
  v_del_lng double precision;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  -- Auto-heal defensivo: garante linha em public.profiles antes de inserir em public.orders (evita FK 23503)
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    INSERT INTO public.profiles (id, email, full_name, role)
    SELECT
      u.id,
      COALESCE(NULLIF(btrim(u.email), ''), u.id::text || '@user.batatatop.local'),
      COALESCE(NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''), NULLIF(btrim(p_customer_name), ''), u.email),
      'user'
    FROM auth.users u
    WHERE u.id = v_uid
    ON CONFLICT DO NOTHING;
  END IF;

  IF p_customer_name IS NULL OR length(btrim(p_customer_name)) = 0 OR length(p_customer_name) > 120 THEN RAISE EXCEPTION 'invalid_customer_name'; END IF;
  IF p_customer_phone IS NULL OR length(btrim(p_customer_phone)) = 0 OR length(p_customer_phone) > 30 THEN RAISE EXCEPTION 'invalid_customer_phone'; END IF;
  IF length(COALESCE(p_customer_address, '')) > 300 OR length(COALESCE(p_customer_neighborhood, '')) > 300 OR length(COALESCE(p_customer_complement, '')) > 300 THEN RAISE EXCEPTION 'address_too_long'; END IF;
  IF length(COALESCE(p_notes, '')) > 500 THEN RAISE EXCEPTION 'notes_too_long'; END IF;
  IF p_delivery_type IS NULL OR p_delivery_type NOT IN ('delivery', 'retirada', 'pickup') THEN RAISE EXCEPTION 'invalid_delivery_type'; END IF;
  IF v_pay_method IS NULL OR v_pay_method NOT IN ('dinheiro', 'pix', 'cartao') THEN RAISE EXCEPTION 'invalid_payment_method'; END IF;
  IF v_online AND v_pay_method = 'dinheiro' THEN RAISE EXCEPTION 'online_requires_pix_or_card'; END IF;

  SELECT setting_value INTO v_store FROM public.store_settings WHERE setting_key = 'store_status';
  IF v_store IS NOT NULL THEN
    IF public.evaluate_store_is_open(v_store) IS NOT TRUE THEN RAISE EXCEPTION 'store_is_closed'; END IF;
    IF p_delivery_type = 'delivery' THEN
      IF COALESCE((v_store->>'isDeliveryEnabled')::boolean, true) IS NOT TRUE THEN RAISE EXCEPTION 'delivery_disabled'; END IF;
      IF COALESCE((v_store->>'isDeliveryFeeEnabled')::boolean, false) IS TRUE THEN
        v_fee := COALESCE((v_store->>'deliveryFee')::numeric, 3.00);
      END IF;
    END IF;
    v_item_promo := COALESCE((v_store->'itemPromo'->>'isActive')::boolean, false);
    v_super_on := COALESCE((v_store->'superPromo'->>'isActive')::boolean, false);
    v_super_price := (v_store->'superPromo'->>'price')::numeric;
    v_legacy_on := COALESCE((v_store->>'isPromoActive')::boolean, false);
    v_legacy_price := COALESCE((v_store->>'promoPrice')::numeric, 24.99);
    IF jsonb_typeof(v_store->'promoProducts') = 'array' THEN v_promos := v_store->'promoProducts'; END IF;
  END IF;

  SELECT count(*) INTO v_cnt FROM public.orders WHERE user_id = v_uid AND status = 'awaiting_payment';
  IF v_cnt >= 3 THEN RAISE EXCEPTION 'too_many_awaiting_orders'; END IF;
  SELECT count(*) INTO v_cnt FROM public.orders WHERE user_id = v_uid AND created_at > now() - interval '10 minutes';
  IF v_cnt >= 5 THEN RAISE EXCEPTION 'rate_limit_exceeded'; END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'invalid_items';
  END IF;

  FOR v_item IN SELECT e FROM jsonb_array_elements(p_items) e LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN RAISE EXCEPTION 'invalid_items'; END IF;
    IF COALESCE(v_item->>'product_id', '') !~ v_re THEN RAISE EXCEPTION 'invalid_product_id'; END IF;
    v_qty := CASE WHEN (v_item->>'quantity') ~ '^[0-9]{1,3}$' THEN (v_item->>'quantity')::int ELSE NULL END;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 99 THEN RAISE EXCEPTION 'invalid_item_quantity'; END IF;
    IF length(COALESCE(v_item->>'pasta_type', '')) > 50 THEN RAISE EXCEPTION 'pasta_type_too_long'; END IF;
    IF length(COALESCE(v_item->>'notes', '')) > 500 THEN RAISE EXCEPTION 'item_notes_too_long'; END IF;

    SELECT id, name, price, category, available INTO v_prod FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
    IF v_prod.available IS NOT TRUE THEN RAISE EXCEPTION 'product_unavailable'; END IF;

    v_price := v_prod.price;
    IF v_item_promo THEN
      v_promo := (SELECT (e->>'promoPrice')::numeric FROM jsonb_array_elements(v_promos) e WHERE e->>'productId' = v_prod.id::text LIMIT 1);
      v_price := COALESCE(v_promo, v_price);
    ELSIF v_super_on AND lower(COALESCE(v_prod.category, '')) IN ('batata', 'batatas') AND v_super_price IS NOT NULL THEN
      v_price := v_super_price;
    ELSIF v_legacy_on THEN
      v_promo := (SELECT (e->>'promoPrice')::numeric FROM jsonb_array_elements(v_promos) e WHERE e->>'productId' = v_prod.id::text LIMIT 1);
      IF v_promo IS NOT NULL THEN v_price := v_promo;
      ELSIF lower(COALESCE(v_prod.category, '')) IN ('batata', 'batatas') THEN v_price := v_legacy_price;
      END IF;
    END IF;

    v_addons_sum := 0;
    v_addons_json := '[]'::jsonb;
    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      IF jsonb_array_length(v_item->'adicionais') > 20 THEN RAISE EXCEPTION 'too_many_addons'; END IF;
      FOR v_addon IN SELECT a FROM jsonb_array_elements(v_item->'adicionais') a LOOP
        v_addon_id := NULL; v_addon_name := NULL; v_addon_qty := 1;
        IF jsonb_typeof(v_addon) = 'object' THEN
          IF COALESCE(v_addon->>'id', '') <> '' THEN
            IF v_addon->>'id' !~ v_re THEN RAISE EXCEPTION 'invalid_addon_id'; END IF;
            v_addon_id := (v_addon->>'id')::uuid;
          END IF;
          v_addon_name := btrim(COALESCE(v_addon->>'name', ''));
          IF v_addon ? 'quantity' THEN
            v_addon_qty := CASE WHEN (v_addon->>'quantity') ~ '^[0-9]{1,3}$' THEN (v_addon->>'quantity')::int ELSE NULL END;
          END IF;
        ELSIF jsonb_typeof(v_addon) = 'string' THEN
          v_addon_name := btrim(v_addon #>> '{}');
        ELSE
          RAISE EXCEPTION 'invalid_addon';
        END IF;
        IF v_addon_qty IS NULL OR v_addon_qty < 1 OR v_addon_qty > 99 THEN RAISE EXCEPTION 'invalid_addon_quantity'; END IF;
        IF v_addon_id IS NOT NULL THEN
          SELECT id, name, price, available INTO v_adic FROM public.adicionais WHERE id = v_addon_id::text;
        ELSIF v_addon_name <> '' THEN
          SELECT id, name, price, available INTO v_adic FROM public.adicionais WHERE upper(name) = upper(v_addon_name) LIMIT 1;
        ELSE
          RAISE EXCEPTION 'invalid_addon';
        END IF;
        IF NOT FOUND THEN RAISE EXCEPTION 'addon_not_found'; END IF;
        IF v_adic.available IS NOT TRUE THEN RAISE EXCEPTION 'addon_unavailable'; END IF;
        v_addons_sum := v_addons_sum + v_adic.price * v_addon_qty;
        v_addons_json := v_addons_json || jsonb_build_array(jsonb_build_object('id', v_adic.id, 'name', v_adic.name, 'price', v_adic.price, 'quantity', v_addon_qty));
      END LOOP;
    END IF;

    v_item_total := round((v_price + v_addons_sum) * v_qty, 2);
    v_subtotal := v_subtotal + v_item_total;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'product_id', v_prod.id, 'product_name', v_prod.name, 'product_price', v_price, 'quantity', v_qty,
      'notes', v_item->>'notes', 'pasta_type', v_item->>'pasta_type', 'adicionais', v_addons_json,
      'category', v_prod.category, 'item_total', v_item_total));
  END LOOP;

  -- Pedido mínimo R$ 20,00 aplica-se APENAS a delivery; retirada/pickup liberado sem mínimo
  IF p_delivery_type = 'delivery' AND round(coalesce(v_subtotal, 0) * 100) < 2000 THEN
    RAISE EXCEPTION 'min_order_value_not_met';
  END IF;

  IF p_coupon_code IS NOT NULL AND btrim(p_coupon_code) <> '' THEN
    IF v_item_promo OR v_super_on OR v_legacy_on THEN
      RAISE EXCEPTION 'coupon_blocked_by_active_promo';
    END IF;

    SELECT * INTO v_coupon FROM public.coupons WHERE upper(code) = upper(btrim(p_coupon_code)) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'coupon_not_found'; END IF;
    IF v_coupon.active IS NOT TRUE THEN RAISE EXCEPTION 'coupon_inactive'; END IF;
    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN RAISE EXCEPTION 'coupon_expired'; END IF;
    IF v_coupon.max_uses IS NOT NULL AND COALESCE(v_coupon.current_uses, 0) >= v_coupon.max_uses THEN RAISE EXCEPTION 'coupon_max_uses_reached'; END IF;

    IF COALESCE(v_coupon.template_origin, '') = 'first_order' OR upper(v_coupon.code) LIKE 'BEMVINDO%' THEN
      SELECT count(*) INTO v_prior_orders FROM public.orders WHERE user_id = v_uid AND status <> 'cancelled';
      IF v_prior_orders > 0 THEN
        RAISE EXCEPTION 'coupon_first_order_only';
      END IF;
    END IF;

    IF v_coupon.min_order_value IS NOT NULL
       AND NOT public.coupon_min_order_met(v_subtotal, v_coupon.min_order_value) THEN
      v_coupon_pending := true;
    END IF;

    IF NOT v_coupon_pending THEN
      IF v_coupon.max_uses_per_user IS NOT NULL THEN
        SELECT count(*) INTO v_uses FROM public.user_coupon_uses WHERE user_id = v_uid AND coupon_id = v_coupon.id;
        IF v_uses >= v_coupon.max_uses_per_user THEN RAISE EXCEPTION 'coupon_user_limit_reached'; END IF;
      END IF;

      -- Regra especial para cupom pessoal de fidelidade: exige titularidade e limita desconto a 1 unidade base de batata
      IF upper(v_coupon.code) LIKE 'FIDELIDADE-%' THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.loyalty_rewards lr
           WHERE upper(lr.coupon_code) = upper(v_coupon.code)
             AND lr.user_id = v_uid
        ) THEN
          RAISE EXCEPTION 'coupon_not_applicable';
        END IF;

        SELECT min((r->>'product_price')::numeric) INTO v_eligible
          FROM jsonb_array_elements(v_rows) r
         WHERE lower(COALESCE(r->>'category', '')) IN ('batata', 'batatas');

        IF v_eligible IS NULL OR v_eligible <= 0 THEN
          RAISE EXCEPTION 'coupon_not_applicable';
        END IF;

        v_discount := round(v_eligible, 2);
      ELSE
        IF v_coupon.restricted_categories IS NOT NULL AND COALESCE(array_length(v_coupon.restricted_categories, 1), 0) > 0 THEN
          SELECT COALESCE(sum((r->>'item_total')::numeric), 0) INTO v_eligible
            FROM jsonb_array_elements(v_rows) r
           WHERE lower(COALESCE(r->>'category', '')) = ANY (
             SELECT lower(x) FROM unnest(v_coupon.restricted_categories) x
           );
          IF v_eligible <= 0 THEN RAISE EXCEPTION 'coupon_not_applicable'; END IF;
        ELSE
          v_eligible := v_subtotal;
        END IF;

        IF v_coupon.discount_type = 'percentage' THEN
          v_discount := round(v_eligible * (v_coupon.discount_value / 100.0), 2);
        ELSIF v_coupon.discount_type = 'fixed' THEN
          v_discount := least(v_coupon.discount_value, v_eligible);
        ELSE
          RAISE EXCEPTION 'coupon_type_unsupported';
        END IF;
      END IF;

      v_has_coupon := true; v_coupon_id := v_coupon.id; v_coupon_code := v_coupon.code;
    END IF;
  END IF;

  v_total := greatest(0, v_subtotal - v_discount + v_fee);

  -- Se o desconto cobrir 100% do total (ex: 1 batata grátis na retirada/entrega grátis), conclui direto sem gateway online
  IF v_total <= 0 AND v_subtotal > 0 AND v_discount >= (v_subtotal + v_fee) THEN
    v_online := false;
    v_pay_method := 'dinheiro';
  END IF;

  IF v_online AND v_total <= 0 THEN RAISE EXCEPTION 'online_total_must_be_positive'; END IF;
  v_status := CASE WHEN v_online THEN 'awaiting_payment' ELSE 'pending' END;

  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  PERFORM pg_advisory_xact_lock(hashtext('order_number_' || v_today::text));
  SELECT COALESCE(max(order_number), 0) + 1 INTO v_number FROM public.orders
   WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date = v_today;

  IF p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) = 'object' THEN
    IF COALESCE(p_metadata->>'troco', '') <> '' THEN
      v_safe_input_meta := v_safe_input_meta || jsonb_build_object('troco', left(p_metadata->>'troco', 30));
    END IF;
    IF (p_metadata->>'installments') ~ '^[0-9]{1,2}$' THEN
      v_safe_input_meta := v_safe_input_meta || jsonb_build_object('installments', (p_metadata->>'installments')::int);
    END IF;
    IF COALESCE(p_metadata->>'saved_card_id', '') ~ v_re THEN
      v_safe_input_meta := v_safe_input_meta || jsonb_build_object('saved_card_id', p_metadata->>'saved_card_id');
    END IF;
    IF (p_metadata->>'card_last_four') ~ '^[0-9]{4}$' THEN
      v_safe_input_meta := v_safe_input_meta || jsonb_build_object('card_last_four', p_metadata->>'card_last_four');
    END IF;
    IF COALESCE(p_metadata->>'address_id', '') ~ v_re THEN
      v_safe_input_meta := v_safe_input_meta || jsonb_build_object('address_id', p_metadata->>'address_id');
    END IF;
    IF COALESCE(p_metadata->>'reference_point', '') <> '' THEN
      v_safe_input_meta := v_safe_input_meta || jsonb_build_object('reference_point', left(p_metadata->>'reference_point', 200));
    END IF;
  END IF;

  v_meta := v_safe_input_meta || jsonb_build_object(
    'source', CASE WHEN p_metadata->>'source' IN ('app', 'site') THEN p_metadata->>'source' ELSE 'app' END,
    'payment_online', v_online, 'subtotal', v_subtotal, 'delivery_fee', v_fee);
  IF p_metadata->>'card_type' IN ('credit', 'debit') THEN v_meta := v_meta || jsonb_build_object('card_type', p_metadata->>'card_type'); END IF;
  IF COALESCE(p_metadata->>'cep', '') <> '' THEN v_meta := v_meta || jsonb_build_object('cep', left(p_metadata->>'cep', 12)); END IF;

  IF (p_metadata->>'delivery_lat') IS NOT NULL AND (p_metadata->>'delivery_lat') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    v_del_lat := (p_metadata->>'delivery_lat')::double precision;
  ELSE
    v_del_lat := NULL;
  END IF;

  IF (p_metadata->>'delivery_lng') IS NOT NULL AND (p_metadata->>'delivery_lng') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    v_del_lng := (p_metadata->>'delivery_lng')::double precision;
  ELSE
    v_del_lng := NULL;
  END IF;

  INSERT INTO public.orders (user_id, customer_name, customer_phone, customer_address, customer_neighborhood, customer_complement,
    payment_method, total_amount, discount_amount, coupon_code, status, notes, delivery_type, order_number, wants_cutlery, metadata, delivery_lat, delivery_lng)
  VALUES (v_uid, btrim(p_customer_name), btrim(p_customer_phone), COALESCE(p_customer_address, ''), COALESCE(p_customer_neighborhood, ''),
    NULLIF(p_customer_complement, ''), v_pay_method, v_total, v_discount,
    CASE WHEN v_has_coupon THEN v_coupon_code ELSE NULL END, v_status, NULLIF(p_notes, ''), p_delivery_type, v_number,
    COALESCE(p_wants_cutlery, false), v_meta, v_del_lat, v_del_lng)
  RETURNING id INTO v_order_id;

  FOR v_row IN SELECT r FROM jsonb_array_elements(v_rows) r LOOP
    INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, notes, adicionais, pasta_type)
    VALUES (v_order_id, (v_row->>'product_id')::uuid, v_row->>'product_name', (v_row->>'product_price')::numeric,
      (v_row->>'quantity')::int, v_row->>'notes', v_row->'adicionais', v_row->>'pasta_type');
  END LOOP;

  IF NOT v_online THEN
    PERFORM public.increment_wait_time_sql();
    UPDATE public.orders SET metadata = metadata || jsonb_build_object('queued', true) WHERE id = v_order_id;
    IF v_has_coupon THEN PERFORM public.confirm_coupon_use(v_order_id); END IF;
  END IF;

  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_number, 'status', v_status,
    'total_amount', v_total, 'discount_amount', v_discount, 'delivery_fee', v_fee, 'subtotal', v_subtotal,
    'coupon_applied', v_has_coupon, 'coupon_pending', v_coupon_pending);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_order(text, text, text, text, text, text, text, boolean, text, text, boolean, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(text, text, text, text, text, text, text, boolean, text, text, boolean, jsonb, jsonb) TO authenticated, service_role;

-- ============================================================
-- 4. BACKFILL DE PROFILES ÓRFÃOS + CRON DE EXPIRAÇÃO PIX/ONLINE
-- ============================================================
INSERT INTO public.profiles (id, email, full_name, role)
SELECT
  u.id,
  COALESCE(NULLIF(btrim(u.email), ''), u.id::text || '@user.batatatop.local'),
  COALESCE(NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''), u.email),
  'user'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.expire_pending_pix_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  WITH expired AS (
    UPDATE public.orders
       SET status = 'cancelled',
           updated_at = now(),
           metadata = COALESCE(metadata, '{}'::jsonb)
             || jsonb_build_object(
                  'cancel_reason', 'pix_expirado_30min',
                  'cancelled_at', now(),
                  'cancelled_by', 'system_expiry'
                )
     WHERE status = 'awaiting_payment'
       AND (
         payment_method = 'pix'
         OR (metadata->>'payment_method') = 'pix'
         OR metadata ? 'pix'
       )
       AND created_at < (now() - interval '30 minutes')
       AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'paid_at')
       AND COALESCE(metadata->>'payment_status', '') NOT IN ('approved', 'accredited', 'processed', 'in_process', 'authorized')
       AND COALESCE(metadata->>'mp_payment_status', '') NOT IN ('approved', 'accredited', 'processed', 'in_process', 'authorized')
       AND COALESCE(metadata->'pix'->>'status', '') NOT IN ('approved', 'accredited', 'processed', 'in_process', 'authorized')
       AND COALESCE((metadata->>'needs_review')::boolean, false) IS NOT TRUE
     RETURNING id
  )
  SELECT count(*) INTO v_count FROM expired;

  RETURN jsonb_build_object(
    'success', true,
    'expired_count', v_count
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.expire_pending_pix_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_pending_pix_orders() TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_abandoned_awaiting_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_awaiting_orders() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF NOT EXISTS (
      SELECT 1
        FROM cron.job
       WHERE active IS TRUE
         AND (
           jobname = 'expire-awaiting-payment-orders'
           OR command ILIKE '%expire_pending_pix_orders%'
           OR command ILIKE '%cleanup_abandoned_awaiting_orders%'
         )
    ) THEN
      PERFORM cron.schedule(
        'expire-awaiting-payment-orders',
        '*/5 * * * *',
        'SELECT public.expire_pending_pix_orders(); SELECT public.cleanup_abandoned_awaiting_orders();'
      );
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END;
$$;
