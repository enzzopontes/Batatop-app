-- ==============================================================================
-- Migration: 20261021120000_create_campaigns_and_cron.sql
-- Gerenciador de Campanhas Push em Massa com Agendamento e Cupom Integrado
-- Totalmente isolado: não altera tabelas existentes nem afeta o site externo.
-- ==============================================================================

-- 1. Criação da tabela campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  image_url text,
  badge_label text,
  coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('draft', 'scheduled', 'processing', 'completed', 'failed', 'cancelled')),
  target_audience text NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'with_orders', 'without_orders')),
  total_recipients integer DEFAULT 0,
  success_count integer DEFAULT 0,
  failure_count integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

-- Índices de alta performance
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled 
ON public.campaigns (scheduled_for) 
WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_campaigns_status 
ON public.campaigns (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaigns_coupon_id 
ON public.campaigns (coupon_id);

-- 2. Row Level Security (RLS) - Exclusivo para Administradores
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view campaigns" ON public.campaigns;
CREATE POLICY "Admins can view campaigns"
ON public.campaigns FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
);

DROP POLICY IF EXISTS "Admins can insert campaigns" ON public.campaigns;
CREATE POLICY "Admins can insert campaigns"
ON public.campaigns FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
);

DROP POLICY IF EXISTS "Admins can update campaigns" ON public.campaigns;
CREATE POLICY "Admins can update campaigns"
ON public.campaigns FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
);

DROP POLICY IF EXISTS "Admins can delete campaigns" ON public.campaigns;
CREATE POLICY "Admins can delete campaigns"
ON public.campaigns FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
);

-- Service Role tem acesso irrestrito para Edge Functions e automação
DROP POLICY IF EXISTS "Service role full access on campaigns" ON public.campaigns;
CREATE POLICY "Service role full access on campaigns"
ON public.campaigns FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- 3. Storage Bucket para Banners de Campanhas
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-banners', 'campaign-banners', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access for campaign-banners'
  ) THEN
    CREATE POLICY "Public Access for campaign-banners"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'campaign-banners');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins can upload campaign-banners'
  ) THEN
    CREATE POLICY "Admins can upload campaign-banners"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'campaign-banners' AND (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
      )
    );
  END IF;
END $$;

-- 4. Função PL/pgSQL de processamento periódico de campanhas pendentes
CREATE OR REPLACE FUNCTION public.process_pending_campaigns()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign record;
  v_count integer := 0;
  v_edge_url text;
  v_service_key text;
BEGIN
  -- Seleciona campanhas vencidas com lock atômico para evitar concorrência dupla
  FOR v_campaign IN
    SELECT id
    FROM public.campaigns
    WHERE status = 'scheduled'
      AND scheduled_for <= now()
    ORDER BY scheduled_for ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Atualiza status atomicamente para 'processing'
    UPDATE public.campaigns
    SET 
      status = 'processing',
      updated_at = now()
    WHERE id = v_campaign.id;

    v_count := v_count + 1;

    -- Disparo assíncrono para a Edge Function via pg_net (se disponível)
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        v_edge_url := current_setting('app.settings.edge_function_url', true);
        v_service_key := current_setting('app.settings.service_role_key', true);

        IF v_edge_url IS NOT NULL AND v_edge_url <> '' THEN
          PERFORM net.http_post(
            url := v_edge_url || '/dispatch-campaign-push',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
            ),
            body := jsonb_build_object('campaignId', v_campaign.id)
          );
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Se pg_net falhar, a Edge Function pode ser engatilhada por fallback ou cron externo
      RAISE NOTICE 'pg_net dispatch failed for campaign %: %', v_campaign.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_count,
    'timestamp', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_pending_campaigns() TO authenticated, service_role;

-- 5. Agendamento com pg_cron (se a extensão estiver disponível no projeto)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  PERFORM cron.unschedule('process-pending-campaigns')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'process-pending-campaigns'
  );

  PERFORM cron.schedule(
    'process-pending-campaigns',
    '* * * * *',
    'SELECT public.process_pending_campaigns();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END $$;
