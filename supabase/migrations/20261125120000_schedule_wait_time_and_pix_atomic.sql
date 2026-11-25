-- 028_schedule_wait_time_and_pix_atomic.sql
-- 1. Atualiza fallback de evaluate_store_is_open de '22:00' para '22:30'
-- 2. Garante de forma idempotente closeTime = '22:30' e espera 30-45 em store_settings.store_status via jsonb_set
-- 3. Versiona public.increment_wait_time_sql() conforme definicao real de producao (sem alterar comportamento)
-- 4. Adiciona RPC atomica public.increment_order_pix_attempts(uuid) para /api/mercadopago/pix

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
  v_close_str text := COALESCE(NULLIF(p_store->>'closeTime', ''), '22:30');
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

GRANT EXECUTE ON FUNCTION public.evaluate_store_is_open(jsonb) TO anon, authenticated, service_role;

UPDATE public.store_settings
   SET setting_value = jsonb_set(
         jsonb_set(
           jsonb_set(
             COALESCE(setting_value, '{}'::jsonb),
             '{closeTime}',
             '"22:30"'::jsonb,
             true
           ),
           '{waitTimeMin}',
           '30'::jsonb,
           true
         ),
         '{waitTimeMax}',
         '45'::jsonb,
         true
       ),
       updated_at = now()
 WHERE setting_key = 'store_status'
   AND (
     setting_value->>'closeTime' IS DISTINCT FROM '22:30'
     OR COALESCE((setting_value->>'waitTimeMin')::int, 0) < 30
     OR COALESCE((setting_value->>'waitTimeMax')::int, 0) < 45
   );

CREATE OR REPLACE FUNCTION public.increment_wait_time_sql()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_status jsonb; v_orders jsonb; v_new jsonb; v_n int;
BEGIN
  SELECT setting_value INTO v_status FROM public.store_settings WHERE setting_key = 'store_status' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  v_orders := COALESCE(v_status->'activeOrders', '[]'::jsonb);
  IF jsonb_typeof(v_orders) <> 'array' THEN v_orders := '[]'::jsonb; END IF;
  v_new := v_orders || jsonb_build_array((extract(epoch from clock_timestamp()) * 1000)::bigint);
  v_n := jsonb_array_length(v_new);
  UPDATE public.store_settings
     SET setting_value = v_status || jsonb_build_object('activeOrders', v_new, 'waitTimeMin', 15 + v_n * 5, 'waitTimeMax', 22 + v_n * 5),
         updated_at = now()
   WHERE setting_key = 'store_status';
END;
$function$;

REVOKE ALL ON FUNCTION public.increment_wait_time_sql() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_wait_time_sql() TO service_role;

CREATE OR REPLACE FUNCTION public.increment_order_pix_attempts(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_next integer;
BEGIN
  UPDATE public.orders
     SET metadata = jsonb_set(
           COALESCE(metadata, '{}'::jsonb),
           '{pix_attempts}',
           to_jsonb(
             CASE
               WHEN jsonb_typeof(metadata->'pix_attempts') = 'number'
                 THEN (metadata->>'pix_attempts')::integer + 1
               ELSE 1
             END
           ),
           true
         ),
         updated_at = now()
   WHERE id = p_order_id
     AND status = 'awaiting_payment'
     AND payment_method = 'pix'
  RETURNING (metadata->>'pix_attempts')::integer INTO v_next;

  RETURN v_next;
END;
$function$;

REVOKE ALL ON FUNCTION public.increment_order_pix_attempts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_order_pix_attempts(uuid) TO service_role;
