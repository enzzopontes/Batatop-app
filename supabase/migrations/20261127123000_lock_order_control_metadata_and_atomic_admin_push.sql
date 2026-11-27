-- Migration: lock_order_control_metadata_and_atomic_admin_push
-- Idempotente (CREATE OR REPLACE + REVOKE/GRANT repetiveis). Rollback: supabase/rollbacks/20261127123000_lock_order_control_metadata_and_atomic_admin_push.rollback.sql
--
-- 1) merge_order_metadata: dono do pedido so escreve chaves de CLIENTE (allowlist).
--    Chaves de CONTROLE (admin_push_sent, admin_push_claimed_at, bark_attempts,
--    bark_last_sent_at, bark_last_error, mp_payment_id, payment_online, delivery_fee,
--    paid_at, payment_status, status, refunded, delivered_at, dispatched_at,
--    arrived_at, auto_delivered_by_mara, ...) sao ignoradas para o dono.
--    Somente service_role, postgres/supabase_admin ou is_admin() escrevem qualquer chave.
-- 2) claim_admin_push / release_admin_push: reserva atomica de admin_push_sent (service_role).

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
  v_clean_patch jsonb := '{}'::jsonb;
  v_result jsonb;
  v_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
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

  IF v_jwt_role = 'service_role'
     OR CURRENT_USER IN ('postgres', 'supabase_admin')
     OR public.is_admin() THEN
    v_clean_patch := patch;
  ELSE
    IF v_caller IS NULL OR v_order_user_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Not authorized to update metadata for order %', order_id
        USING ERRCODE = '42501';
    END IF;

    IF v_order_status NOT IN ('pending', 'awaiting_payment') THEN
      RAISE EXCEPTION 'Not allowed to modify metadata in current order status'
        USING ERRCODE = '42501';
    END IF;

    IF patch ? 'troco' AND COALESCE(patch->>'troco', '') <> '' THEN
      v_clean_patch := v_clean_patch || jsonb_build_object('troco', left(patch->>'troco', 30));
    END IF;
    IF patch ? 'cep' AND COALESCE(patch->>'cep', '') <> '' THEN
      v_clean_patch := v_clean_patch || jsonb_build_object('cep', left(patch->>'cep', 12));
    END IF;
    IF patch ? 'reference_point' AND COALESCE(patch->>'reference_point', '') <> '' THEN
      v_clean_patch := v_clean_patch || jsonb_build_object('reference_point', left(patch->>'reference_point', 200));
    END IF;
    IF patch ? 'address_id' AND COALESCE(patch->>'address_id', '') ~ v_re THEN
      v_clean_patch := v_clean_patch || jsonb_build_object('address_id', patch->>'address_id');
    END IF;
    IF patch ? 'card_last_four' AND COALESCE(patch->>'card_last_four', '') ~ '^[0-9]{4}$' THEN
      v_clean_patch := v_clean_patch || jsonb_build_object('card_last_four', patch->>'card_last_four');
    END IF;
    IF patch ? 'installments' AND COALESCE(patch->>'installments', '') ~ '^[0-9]{1,2}$' THEN
      v_clean_patch := v_clean_patch || jsonb_build_object('installments', (patch->>'installments')::int);
    END IF;
    IF patch ? 'source' AND (patch->>'source') IN ('app', 'site') THEN
      v_clean_patch := v_clean_patch || jsonb_build_object('source', patch->>'source');
    END IF;
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

-- 2) Reserva atomica do push de novo pedido (somente service_role).
CREATE OR REPLACE FUNCTION public.claim_admin_push(
  p_order_id uuid,
  p_user_id uuid,
  p_is_admin boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_user_id uuid;
  v_status text;
  v_metadata jsonb;
  v_recent integer;
  v_rows integer;
  c_window constant interval := interval '10 minutes';
  c_max_claims constant integer := 5;
BEGIN
  SELECT o.user_id, o.status, o.metadata
  INTO v_order_user_id, v_status, v_metadata
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_found');
  END IF;

  IF NOT COALESCE(p_is_admin, false)
     AND (p_user_id IS NULL OR v_order_user_id IS DISTINCT FROM p_user_id) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'forbidden');
  END IF;

  IF v_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'invalid_status');
  END IF;

  IF COALESCE(v_metadata->>'admin_push_sent', 'false') = 'true' THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_sent');
  END IF;

  IF NOT COALESCE(p_is_admin, false) THEN
    SELECT count(*)
    INTO v_recent
    FROM public.orders o
    WHERE o.user_id = p_user_id
      AND o.id <> p_order_id
      AND o.metadata ? 'admin_push_claimed_at'
      AND (o.metadata->>'admin_push_claimed_at')::timestamptz > now() - c_window;

    IF v_recent >= c_max_claims THEN
      RETURN jsonb_build_object('claimed', false, 'reason', 'rate_limited');
    END IF;
  END IF;

  UPDATE public.orders o
  SET metadata = COALESCE(o.metadata, '{}'::jsonb)
    || jsonb_build_object('admin_push_sent', true, 'admin_push_claimed_at', to_jsonb(now()))
  WHERE o.id = p_order_id
    AND o.status = 'pending'
    AND COALESCE(o.metadata->>'admin_push_sent', 'false') <> 'true';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_sent');
  END IF;

  RETURN jsonb_build_object('claimed', true, 'reason', 'claimed');
END;
$$;

CREATE OR REPLACE FUNCTION public.release_admin_push(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.orders o
  SET metadata = COALESCE(o.metadata, '{}'::jsonb) || jsonb_build_object('admin_push_sent', false)
  WHERE o.id = p_order_id
    AND o.status = 'pending'
    AND o.metadata ? 'admin_push_claimed_at'
    AND COALESCE(o.metadata->>'admin_push_sent', 'false') = 'true';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN v_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_admin_push(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_admin_push(uuid, uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.release_admin_push(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_admin_push(uuid) TO service_role;

COMMENT ON FUNCTION public.claim_admin_push(uuid, uuid, boolean) IS
  'Reserva atomica de admin_push_sent para notify-admin-order: valida dono, status pending, limite 5 claims/10min por usuario. Somente service_role.';
COMMENT ON FUNCTION public.release_admin_push(uuid) IS
  'Libera admin_push_sent reservado por claim_admin_push quando o envio do push falha. Somente service_role.';
