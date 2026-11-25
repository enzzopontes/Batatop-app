-- 029_rls_coupons_and_loyalty_polp.sql
-- 1. Neutraliza policy legada permissiva que anulava filtro anti-enumeracao de FIDELIDADE-% em public.coupons
-- 2. Remove is_admin() da policy publica de coupons para evitar permission denied para anon (admins cobertos por coupons_admin_all)
-- 3. Reafirma definicao SECURITY DEFINER de trg_fn_orders_loyalty_on_delivered e aplica PoLP (REVOKE de authenticated)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'coupons'
      AND policyname = 'coupons_anyone_select_active'
  ) THEN
    ALTER POLICY coupons_anyone_select_active ON public.coupons USING (false);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'coupons'
      AND policyname = 'Anyone can view active coupons'
  ) THEN
    ALTER POLICY "Anyone can view active coupons" ON public.coupons
    USING (
      active = true
      AND (
        upper(code) NOT LIKE 'FIDELIDADE-%'
        OR EXISTS (
          SELECT 1
          FROM public.loyalty_rewards lr
          WHERE upper(lr.coupon_code) = upper(coupons.code)
            AND lr.user_id = auth.uid()
        )
      )
    );
  END IF;
END
$$;

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

REVOKE EXECUTE ON FUNCTION public.process_order_loyalty(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_order_loyalty(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.trg_fn_orders_loyalty_on_delivered() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_fn_orders_loyalty_on_delivered() TO service_role;
