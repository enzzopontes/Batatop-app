-- ============================================================
-- 20261015140000_live_tracking_and_feedbacks.sql
-- Batata Top - Rastreamento ao Vivo da Mara e Sistema de Feedbacks
-- ============================================================

-- 1. Colunas latitude e longitude em addresses e delivery_lat / delivery_lng em orders
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_lat double precision;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_lng double precision;

-- 2. Atualizar constraint de status para permitir 'out_for_delivery'
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'awaiting_payment'::text,
    'pending'::text,
    'preparing'::text,
    'ready'::text,
    'out_for_delivery'::text,
    'delivered'::text,
    'cancelled'::text
  ]));

-- 3. Tabela de rastreamento Realtime da Mara
CREATE TABLE IF NOT EXISTS public.delivery_tracking (
  id text PRIMARY KEY DEFAULT 'live',
  driver_lat double precision NOT NULL,
  driver_lng double precision NOT NULL,
  heading double precision DEFAULT 0,
  speed double precision DEFAULT 0,
  active_order_ids text[] DEFAULT '{}',
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view delivery_tracking" ON public.delivery_tracking;
CREATE POLICY "Anyone can view delivery_tracking" ON public.delivery_tracking FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can update delivery_tracking" ON public.delivery_tracking;
CREATE POLICY "Admins can update delivery_tracking" ON public.delivery_tracking FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

INSERT INTO public.delivery_tracking (id, driver_lat, driver_lng, heading, updated_at)
VALUES ('live', -21.8402, -49.0058, 0, now())
ON CONFLICT (id) DO NOTHING;

-- 4. Tabela feedbacks: order_id e tags
ALTER TABLE public.feedbacks ADD COLUMN IF NOT EXISTS order_id text;
ALTER TABLE public.feedbacks ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
DROP POLICY IF EXISTS "Users can view their own feedbacks" ON public.feedbacks;
CREATE POLICY "Users can view their own feedbacks" ON public.feedbacks FOR SELECT USING (auth.uid() = user_id);

-- 5. RPC para o cliente confirmar recebimento
CREATE OR REPLACE FUNCTION public.confirm_order_delivered_user(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE public.orders
  SET status = 'delivered',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('client_confirmed_delivery_at', now()),
      updated_at = now()
  WHERE id = p_order_id
    AND user_id = auth.uid()
    AND status IN ('out_for_delivery', 'ready', 'preparing');
  RETURN FOUND;
END;
$$;

-- 6. Adicionar tabelas à publicação realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_tracking;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
