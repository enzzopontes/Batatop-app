-- ============================================================
-- 20261015150000_security_hardening_live_tracking.sql
-- Batata Top - Hardening de Segurança, RLS e Privacidade de GPS
-- ============================================================

-- 1. delivery_tracking: permitir nulls no kill-switch e adicionar is_active e public_stops
ALTER TABLE public.delivery_tracking
  ALTER COLUMN driver_lat DROP NOT NULL,
  ALTER COLUMN driver_lng DROP NOT NULL;

ALTER TABLE public.delivery_tracking
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_stops jsonb DEFAULT '[]'::jsonb;

-- 2. delivery_tracking: RLS estrito (sem select público)
DROP POLICY IF EXISTS "Anyone can view delivery_tracking" ON public.delivery_tracking;
DROP POLICY IF EXISTS "Admins can update delivery_tracking" ON public.delivery_tracking;
DROP POLICY IF EXISTS "Authorized view of delivery_tracking" ON public.delivery_tracking;
DROP POLICY IF EXISTS "Admins can manage delivery_tracking" ON public.delivery_tracking;

CREATE POLICY "Authorized view of delivery_tracking"
  ON public.delivery_tracking FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.user_id = auth.uid()
        AND orders.status = 'out_for_delivery'
    )
  );

CREATE POLICY "Admins can manage delivery_tracking"
  ON public.delivery_tracking FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 3. Blindagem da RPC confirm_order_delivered_user
CREATE OR REPLACE FUNCTION public.confirm_order_delivered_user(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- 4. Blindagem de feedbacks
ALTER TABLE public.feedbacks DROP CONSTRAINT IF EXISTS feedbacks_order_id_unique;
ALTER TABLE public.feedbacks ADD CONSTRAINT feedbacks_order_id_unique UNIQUE (order_id);

ALTER TABLE public.feedbacks DROP CONSTRAINT IF EXISTS feedbacks_rating_range;
ALTER TABLE public.feedbacks ADD CONSTRAINT feedbacks_rating_range CHECK (rating >= 1 AND rating <= 5);

ALTER TABLE public.feedbacks DROP CONSTRAINT IF EXISTS feedbacks_comment_len;
ALTER TABLE public.feedbacks ADD CONSTRAINT feedbacks_comment_len CHECK (comment IS NULL OR char_length(comment) <= 500);

ALTER TABLE public.feedbacks DROP CONSTRAINT IF EXISTS feedbacks_tags_cardinality;
ALTER TABLE public.feedbacks ADD CONSTRAINT feedbacks_tags_cardinality CHECK (tags IS NULL OR cardinality(tags) <= 6);

DROP POLICY IF EXISTS "Anyone can insert feedbacks" ON public.feedbacks;
DROP POLICY IF EXISTS "feedbacks_insert_public" ON public.feedbacks;
DROP POLICY IF EXISTS "Users can insert feedback for own delivered orders" ON public.feedbacks;

CREATE POLICY "Users can insert feedback for own delivered orders"
  ON public.feedbacks FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id::text = feedbacks.order_id
        AND orders.user_id = auth.uid()
        AND orders.status = 'delivered'
    )
  );
