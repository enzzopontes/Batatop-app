-- ==============================================================================
-- Migration: 20261015200000_security_audit_rls_and_rpc_hardening.sql
-- Blindagem de RLS (orders, order_items, delivery_tracking, admin_push_tokens)
-- Blindagem de RPCs (get_admin_push_tokens, cancel_order_user, confirm_order_delivered_user)
-- ==============================================================================

-- 1. Hardening RLS em orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own orders or admins all" ON public.orders;
DROP POLICY IF EXISTS "orders_select_owner_or_admin" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_admin_only" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;
DROP POLICY IF EXISTS "orders_update_admin_only" ON public.orders;
DROP POLICY IF EXISTS "Users update own pending orders or admins any" ON public.orders;
DROP POLICY IF EXISTS "orders_delete_admin_only" ON public.orders;
DROP POLICY IF EXISTS "orders_update_owner_or_admin" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_owner_or_admin" ON public.orders;

CREATE POLICY "orders_select_owner_or_admin"
ON public.orders
FOR SELECT
TO authenticated
USING (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  OR public.is_admin()
);

CREATE POLICY "orders_insert_owner_or_admin"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  OR public.is_admin()
);

CREATE POLICY "orders_update_owner_or_admin"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id AND status IN ('pending', 'awaiting_payment'))
  OR public.is_admin()
)
WITH CHECK (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id AND status IN ('pending', 'awaiting_payment', 'cancelled'))
  OR public.is_admin()
);

CREATE POLICY "orders_delete_admin_only"
ON public.orders
FOR DELETE
TO authenticated
USING (public.is_admin());

-- 2. Hardening RLS em order_items
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own order items or admins all" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select_owner_or_admin" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_admin_only" ON public.order_items;
DROP POLICY IF EXISTS "Users can insert order items for own orders" ON public.order_items;
DROP POLICY IF EXISTS "order_items_update_admin_only" ON public.order_items;
DROP POLICY IF EXISTS "order_items_delete_admin_only" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_owner_or_admin" ON public.order_items;

CREATE POLICY "order_items_select_owner_or_admin"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
    )
  )
);

CREATE POLICY "order_items_insert_owner_or_admin"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
    )
  )
);

CREATE POLICY "order_items_update_admin_only"
ON public.order_items
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "order_items_delete_admin_only"
ON public.order_items
FOR DELETE
TO authenticated
USING (public.is_admin());

-- 3. Hardening RLS em delivery_tracking
ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized view of delivery_tracking" ON public.delivery_tracking;
DROP POLICY IF EXISTS "Admins can manage delivery_tracking" ON public.delivery_tracking;
DROP POLICY IF EXISTS "delivery_tracking_select_authorized" ON public.delivery_tracking;
DROP POLICY IF EXISTS "delivery_tracking_admin_all" ON public.delivery_tracking;

CREATE POLICY "delivery_tracking_select_authorized"
ON public.delivery_tracking
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.user_id = auth.uid()
        AND o.status = 'out_for_delivery'
    )
  )
);

CREATE POLICY "delivery_tracking_admin_all"
ON public.delivery_tracking
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 4. Hardening RLS em admin_push_tokens
ALTER TABLE public.admin_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin gerencia proprio token" ON public.admin_push_tokens;
DROP POLICY IF EXISTS "admin_tokens_only_admin" ON public.admin_push_tokens;
DROP POLICY IF EXISTS "admin_push_tokens_admin_only" ON public.admin_push_tokens;

CREATE POLICY "admin_push_tokens_admin_only"
ON public.admin_push_tokens
FOR ALL
TO authenticated
USING (auth.uid() = user_id AND public.is_admin())
WITH CHECK (auth.uid() = user_id AND public.is_admin());

-- 5. Hardening RPC get_admin_push_tokens
CREATE OR REPLACE FUNCTION public.get_admin_push_tokens()
RETURNS TABLE (expo_push_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;

  RETURN QUERY
  SELECT DISTINCT a.expo_push_token
  FROM public.admin_push_tokens a
  WHERE a.expo_push_token IS NOT NULL AND a.expo_push_token != '';
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_push_tokens() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_push_tokens() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_push_tokens() TO authenticated;

-- 6. Hardening RPC cancel_order_user
CREATE OR REPLACE FUNCTION public.cancel_order_user(p_order_id uuid, p_cancel_reason text DEFAULT 'cancelado_pelo_cliente'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order record;
  v_paid boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT id, user_id, status, metadata
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_order.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'forbidden_not_owner';
  END IF;

  -- Blindagem: cancelamento pelo cliente permitido apenas em awaiting_payment ou pending
  IF v_order.status NOT IN ('awaiting_payment', 'pending') THEN
    RAISE EXCEPTION 'order_status_not_cancellable';
  END IF;

  v_paid := COALESCE(v_order.metadata, '{}'::jsonb) ? 'paid_at';

  UPDATE public.orders
  SET status = 'cancelled',
      updated_at = now(),
      metadata = COALESCE(metadata, '{}'::jsonb)
        || jsonb_build_object(
             'cancel_reason', COALESCE(left(p_cancel_reason, 200), 'cancelado_pelo_cliente'),
             'cancelled_at', now(),
             'cancelled_by', 'customer'
           )
        || CASE
             WHEN v_paid THEN jsonb_build_object('needs_review', true, 'review_reason', 'cancelled_after_payment_refund_needed')
             ELSE '{}'::jsonb
           END
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'cancelled',
    'refund_needed', v_paid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order_user(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_order_user(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_order_user(uuid, text) TO authenticated;

-- 7. Hardening RPC confirm_order_delivered_user
CREATE OR REPLACE FUNCTION public.confirm_order_delivered_user(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_updated boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.orders
  SET status = 'delivered',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('client_confirmed_delivery_at', now()),
      updated_at = now()
  WHERE id = p_order_id
    AND user_id = v_uid
    AND status = 'out_for_delivery';

  v_updated := FOUND;
  IF NOT v_updated THEN
    RAISE EXCEPTION 'order_not_eligible_for_delivery_confirmation';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_order_delivered_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_order_delivered_user(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_delivered_user(uuid) TO authenticated;
