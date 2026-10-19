-- ==============================================================================
-- Migration: 20261017095500_auto_deactivate_delivery_tracking_cron.sql
-- Auto-advance order progression (including out_for_delivery -> delivered when
-- GPS is inactive) and auto-clean delivery_tracking via pg_cron when no orders
-- are out_for_delivery or tracking is stale (> 30 minutes).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.advance_order_progression()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  is_gps_active boolean := false;
  v_last_gps_ping timestamptz := NULL;
  v_ready_count integer := 0;
  v_delivered_count integer := 0;
  v_remaining_out_for_delivery integer := 0;
  v_tracking_deactivated boolean := false;
BEGIN
  -- 1. Verifica estado atual e último ping do GPS ao vivo da Mara (heartbeat de 2 minutos)
  SELECT
    COALESCE(dt.is_active AND dt.driver_lat IS NOT NULL AND dt.driver_lng IS NOT NULL, false),
    dt.updated_at
  INTO is_gps_active, v_last_gps_ping
  FROM public.delivery_tracking dt
  WHERE dt.id = 'live';

  is_gps_active := COALESCE(is_gps_active, false);

  IF is_gps_active AND (v_last_gps_ping IS NULL OR v_last_gps_ping < (now() - interval '2 minutes')) THEN
    UPDATE public.delivery_tracking dt
    SET
      is_active = false,
      driver_lat = NULL,
      driver_lng = NULL,
      heading = 0,
      speed = 0,
      active_order_ids = '{}',
      public_stops = '[]'::jsonb,
      updated_at = now()
    WHERE dt.id = 'live';

    is_gps_active := false;
    v_tracking_deactivated := true;
  END IF;

  -- 2. Avança pedidos em preparo ('preparing') para 'ready' após o tempo estimado
  WITH to_ready AS (
    UPDATE public.orders o
    SET
      status = 'ready',
      updated_at = now(),
      metadata = COALESCE(o.metadata, '{}'::jsonb) || jsonb_build_object('ready_at', now())
    WHERE o.status = 'preparing'
      AND (
        (
          o.metadata ? 'readyAt'
          AND (o.metadata->>'readyAt')::timestamptz <= now()
        )
        OR (
          NOT (o.metadata ? 'readyAt')
          AND o.updated_at <= (now() - interval '25 minutes')
        )
      )
    RETURNING o.id
  )
  SELECT count(*) INTO v_ready_count FROM to_ready;

  -- 3. Avança pedidos 'out_for_delivery' -> 'delivered':
  --    - Incondicionalmente (independente de is_gps_active): pedidos com arrived_at / auto_deliver_at vencidos (2 minutos após chegada na porta)
  --    - Se GPS inativo (ELSE): segue a regra normal de deliveredAt (ou 45 min em rota) apenas para pedidos sem arrived_at
  WITH arrived_to_delivered AS (
    UPDATE public.orders o
    SET
      status = 'delivered',
      updated_at = now(),
      metadata = COALESCE(o.metadata, '{}'::jsonb) || jsonb_build_object(
        'delivered_at', now(),
        'auto_delivered_by_cron', true
      )
    WHERE o.status = 'out_for_delivery'
      AND (o.metadata->>'arrived_at') IS NOT NULL
      AND (
        (
          (o.metadata->>'auto_deliver_at') IS NOT NULL
          AND (o.metadata->>'auto_deliver_at')::timestamptz <= now()
        )
        OR (o.metadata->>'arrived_at')::timestamptz <= (now() - interval '2 minutes')
      )
    RETURNING o.id
  )
  SELECT count(*) INTO v_delivered_count FROM arrived_to_delivered;

  IF is_gps_active THEN
    -- Com GPS ativo, apenas a regra de arrived_at (executada acima) dá baixa automática
    NULL;
  ELSE
    WITH fallback_to_delivered AS (
      UPDATE public.orders o
      SET
        status = 'delivered',
        updated_at = now(),
        metadata = COALESCE(o.metadata, '{}'::jsonb) || jsonb_build_object(
          'delivered_at', now(),
          'auto_delivered_by_cron', true
        )
      WHERE o.status = 'out_for_delivery'
        AND (o.metadata->>'arrived_at') IS NULL
        AND (
          (
            o.metadata ? 'deliveredAt'
            AND (o.metadata->>'deliveredAt')::timestamptz <= now()
          )
          OR (
            NOT (o.metadata ? 'deliveredAt')
            AND o.updated_at <= (now() - interval '45 minutes')
          )
        )
      RETURNING o.id
    )
    SELECT v_delivered_count + count(*) INTO v_delivered_count FROM fallback_to_delivered;
  END IF;

  -- 4. Conta quantos pedidos continuam em 'out_for_delivery'
  SELECT count(*)
  INTO v_remaining_out_for_delivery
  FROM public.orders o
  WHERE o.status = 'out_for_delivery';

  -- 5. Kill-Switch automático de privacidade se não restar nenhum pedido em rota
  IF v_remaining_out_for_delivery = 0 THEN
    UPDATE public.delivery_tracking dt
    SET
      is_active = false,
      driver_lat = NULL,
      driver_lng = NULL,
      heading = 0,
      speed = 0,
      active_order_ids = '{}',
      public_stops = '[]'::jsonb,
      updated_at = now()
    WHERE dt.id = 'live'
      AND (
        dt.is_active IS TRUE
        OR dt.driver_lat IS NOT NULL
        OR dt.driver_lng IS NOT NULL
      );
    v_tracking_deactivated := v_tracking_deactivated OR FOUND;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_gps_active', is_gps_active,
    'ready_advanced', v_ready_count,
    'delivered_advanced', v_delivered_count,
    'remaining_out_for_delivery', v_remaining_out_for_delivery,
    'tracking_deactivated', v_tracking_deactivated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_order_progression() TO authenticated, service_role;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  PERFORM cron.unschedule('advance-order-progression')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'advance-order-progression'
  );

  PERFORM cron.schedule(
    'advance-order-progression',
    '* * * * *',
    'SELECT public.advance_order_progression();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END;
$$;
