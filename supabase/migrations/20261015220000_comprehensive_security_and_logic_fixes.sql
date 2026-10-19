-- ==============================================================================
-- Migration: 20261015220000_comprehensive_security_and_logic_fixes.sql
-- Comprehensive Security & Business Logic Hardening (RLS, Triggers, RPCs, Storage)
-- ==============================================================================

-- 1. Orders RLS Lockdown
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert their own orders" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_owner_or_admin" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_admin" ON public.orders;
DROP POLICY IF EXISTS "Users can update their own pending orders" ON public.orders;
DROP POLICY IF EXISTS "orders_update_owner_or_admin" ON public.orders;
DROP POLICY IF EXISTS "orders_update_admin" ON public.orders;
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;

CREATE POLICY "orders_insert_admin"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "orders_update_admin"
ON public.orders
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 2. Order Items RLS Lockdown
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create order items for their orders" ON public.order_items;
DROP POLICY IF EXISTS "Users can insert their own order items" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_owner_or_admin" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_admin" ON public.order_items;
DROP POLICY IF EXISTS "order_items_update_admin" ON public.order_items;
DROP POLICY IF EXISTS "order_items_update_admin_only" ON public.order_items;

CREATE POLICY "order_items_insert_admin"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "order_items_update_admin"
ON public.order_items
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 3. Feedbacks RLS Policy Collision Fix
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit feedbacks" ON public.feedbacks;
DROP POLICY IF EXISTS "Anyone can insert feedbacks" ON public.feedbacks;
DROP POLICY IF EXISTS "feedbacks_insert_public" ON public.feedbacks;

-- 4. Profiles Role Trigger (BEFORE INSERT OR UPDATE)
CREATE OR REPLACE FUNCTION public.protect_profiles_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
       AND CURRENT_USER NOT IN ('postgres', 'supabase_admin')
       AND NOT public.is_admin() THEN
      IF NEW.role IS DISTINCT FROM 'customer' THEN
        NEW.role := 'customer';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
         AND CURRENT_USER NOT IN ('postgres', 'supabase_admin')
         AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado: nao e permitido alterar o proprio cargo (role).';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_protect_profiles_role ON public.profiles;
CREATE TRIGGER trigger_protect_profiles_role
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_role();

-- 5. Hardening public.merge_order_metadata(order_id uuid, patch jsonb)
DROP FUNCTION IF EXISTS public.merge_order_metadata(text, jsonb);
DROP FUNCTION IF EXISTS public.merge_order_metadata(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.merge_order_metadata(order_id uuid, patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_jwt_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_order_user_id uuid;
  v_order_status text;
  v_clean_patch jsonb := patch;
  v_result jsonb;
BEGIN
  IF patch IS NULL OR jsonb_typeof(patch) <> 'object' THEN
    RAISE EXCEPTION 'patch must be a JSON object';
  END IF;

  SELECT o.user_id, o.status
  INTO v_order_user_id, v_order_status
  FROM public.orders o
  WHERE o.id = merge_order_metadata.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', order_id
      USING ERRCODE = 'P0002';
  END IF;

  -- When caller is neither service_role nor admin, enforce owner + status + key sanitization
  IF v_jwt_role <> 'service_role'
     AND CURRENT_USER NOT IN ('postgres', 'supabase_admin')
     AND NOT public.is_admin() THEN
    IF v_caller IS NULL OR v_order_user_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Not authorized to update metadata for order %', order_id
        USING ERRCODE = '42501';
    END IF;

    IF v_order_status NOT IN ('pending', 'awaiting_payment') THEN
      RAISE EXCEPTION 'Not allowed to modify metadata in current order status'
        USING ERRCODE = '42501';
    END IF;

    v_clean_patch := patch
      - 'paid_at'
      - 'payment_status'
      - 'status'
      - 'refunded'
      - 'admin_push_sent'
      - 'auto_delivered_by_mara'
      - 'delivered_at'
      - 'dispatched_at'
      - 'arrived_at';
  END IF;

  UPDATE public.orders o
  SET
    metadata = COALESCE(o.metadata, '{}'::jsonb) || v_clean_patch,
    updated_at = now()
  WHERE o.id = merge_order_metadata.order_id
  RETURNING o.metadata INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_order_metadata(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_order_metadata(uuid, jsonb) TO authenticated, service_role;

-- 6. Hardening & Fix public.dispatch_admin_new_order_push(p_order_id uuid)
DROP FUNCTION IF EXISTS public.dispatch_admin_new_order_push(text);
DROP FUNCTION IF EXISTS public.dispatch_admin_new_order_push(uuid);

CREATE OR REPLACE FUNCTION public.dispatch_admin_new_order_push(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_jwt_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_order record;
  v_tokens text[];
  v_token text;
  v_items_summary text := '';
  v_num_label text;
  v_delivery_label text;
  v_title text;
  v_body text;
  v_messages jsonb := '[]'::jsonb;
  v_req_id bigint;
BEGIN
  IF v_caller IS NULL
     AND v_jwt_role <> 'service_role'
     AND CURRENT_USER NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT
    o.id,
    o.user_id,
    o.status,
    o.metadata,
    o.order_number,
    o.customer_name,
    o.customer_phone,
    o.delivery_type,
    o.customer_address,
    o.customer_neighborhood,
    o.customer_complement,
    o.payment_method,
    o.total_amount,
    o.discount_amount,
    o.notes
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'sent', false, 'reason', 'order_not_found');
  END IF;

  IF v_jwt_role <> 'service_role'
     AND CURRENT_USER NOT IN ('postgres', 'supabase_admin')
     AND v_order.user_id IS DISTINCT FROM v_caller
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: not order owner or admin' USING ERRCODE = '42501';
  END IF;

  IF v_order.status = 'awaiting_payment' THEN
    RETURN jsonb_build_object('success', false, 'sent', false, 'reason', 'awaiting_payment');
  END IF;

  IF COALESCE((v_order.metadata->>'admin_push_sent')::boolean, false) = true THEN
    RETURN jsonb_build_object('success', true, 'sent', false, 'already_sent', true);
  END IF;

  SELECT array_agg(DISTINCT t.expo_push_token)
  INTO v_tokens
  FROM public.admin_push_tokens t
  WHERE t.expo_push_token IS NOT NULL
    AND length(trim(t.expo_push_token)) > 0;

  IF v_tokens IS NULL OR array_length(v_tokens, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'sent', false, 'reason', 'no_admin_tokens');
  END IF;

  SELECT string_agg(
    format('• %sx %s', COALESCE(oi.quantity, 1), COALESCE(oi.product_name, 'Item')),
    E'\n'
  )
  INTO v_items_summary
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  v_num_label := CASE
    WHEN v_order.order_number IS NOT NULL THEN '#' || v_order.order_number::text
    ELSE '#' || upper(left(v_order.id::text, 6))
  END;

  v_delivery_label := CASE
    WHEN v_order.delivery_type IN ('pickup', 'retirada') THEN 'Retirada'
    ELSE 'Entrega'
  END;

  v_title := format('🍟 Novo Pedido %s — R$ %s',
    v_num_label,
    replace(to_char(COALESCE(v_order.total_amount, 0), 'FM999990D00'), '.', ',')
  );

  v_body := concat_ws(
    E'\n',
    format('👤 %s • 📞 %s', COALESCE(v_order.customer_name, 'Cliente'), COALESCE(v_order.customer_phone, 'S/ telefone')),
    v_delivery_label,
    CASE WHEN v_order.delivery_type NOT IN ('pickup', 'retirada') AND v_order.customer_address IS NOT NULL
      THEN format('📍 %s%s', v_order.customer_address,
        CASE WHEN v_order.customer_neighborhood IS NOT NULL AND v_order.customer_neighborhood <> ''
          THEN ' - ' || v_order.customer_neighborhood
          ELSE ''
        END
      )
      ELSE NULL
    END,
    CASE WHEN v_items_summary IS NOT NULL AND v_items_summary <> ''
      THEN E'🛒 Itens:\n' || v_items_summary
      ELSE NULL
    END,
    CASE WHEN v_order.notes IS NOT NULL AND trim(v_order.notes) <> ''
      THEN '📝 Obs: ' || trim(v_order.notes)
      ELSE NULL
    END
  );

  FOREACH v_token IN ARRAY v_tokens LOOP
    v_messages := v_messages || jsonb_build_array(
      jsonb_build_object(
        'to', v_token,
        'sound', 'new_order.mp3',
        'title', v_title,
        'body', v_body,
        'priority', 'high',
        'channelId', 'new-orders',
        'data', jsonb_build_object(
          'type', 'new_order',
          'orderId', v_order.id,
          'orderNumber', v_order.order_number,
          'url', '/admin/pedidos'
        )
      )
    );
  END LOOP;

  SELECT net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Accept": "application/json", "Content-Type": "application/json"}'::jsonb,
    body := v_messages
  ) INTO v_req_id;

  UPDATE public.orders
  SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"admin_push_sent": true}'::jsonb
  WHERE id::text = p_order_id::text;

  RETURN jsonb_build_object(
    'success', true,
    'sent', true,
    'tokens_count', array_length(v_tokens, 1),
    'token_count', array_length(v_tokens, 1),
    'request_id', v_req_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_admin_new_order_push(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_admin_new_order_push(uuid) TO authenticated, service_role;

-- 7. Size limit on public.uploaded_images
ALTER TABLE public.uploaded_images DROP CONSTRAINT IF EXISTS uploaded_images_data_max_length;
ALTER TABLE public.uploaded_images ADD CONSTRAINT uploaded_images_data_max_length CHECK (octet_length(data) <= 2800000) NOT VALID;

NOTIFY pgrst, 'reload schema';
