-- ============================================================
-- 20261016183000_pix_payment_auto_transition_to_preparing.sql
-- Batata Top Delivery - Transição automática Pix para 'preparing'
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_payment_result(
  p_order_id uuid,
  p_payment_id text,
  p_mp_status text,
  p_amount numeric,
  p_status_detail text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order record; v_total numeric; v_payments jsonb; v_entry jsonb; v_current text;
  v_over numeric; v_cres jsonb; v_review boolean := false; v_reason text;
BEGIN
  SELECT id, status, total_amount, coupon_code, payment_method, metadata, order_number
    INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'action', 'order_not_found'); END IF;
  v_total := v_order.total_amount;
  v_payments := COALESCE(v_order.metadata->'mp_payments', '[]'::jsonb);

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_payments) e WHERE e->>'payment_id' = p_payment_id AND e->>'status' = p_mp_status) THEN
    RETURN jsonb_build_object('success', true, 'action', 'already_processed');
  END IF;
  v_entry := jsonb_build_object('payment_id', p_payment_id, 'status', p_mp_status, 'status_detail', p_status_detail, 'amount', p_amount, 'received_at', now());
  v_payments := v_payments || jsonb_build_array(v_entry);

  IF p_mp_status = 'approved' THEN
    IF v_order.status IN ('preparing', 'ready', 'delivered') THEN
      UPDATE public.orders SET updated_at = now(), metadata = metadata || jsonb_build_object('mp_payments', v_payments, 'needs_review', true, 'review_reason', 'duplicate_payment', 'duplicate_payment_id', p_payment_id) WHERE id = p_order_id;
      RETURN jsonb_build_object('success', true, 'action', 'flagged_duplicate', 'needs_review', true, 'review_reason', 'duplicate_payment', 'order_number', v_order.order_number);
    END IF;
    IF v_order.status = 'cancelled' THEN
      UPDATE public.orders SET updated_at = now(), metadata = metadata || jsonb_build_object('mp_payments', v_payments, 'needs_review', true, 'review_reason', 'paid_after_cancel', 'late_payment_id', p_payment_id, 'late_amount', p_amount) WHERE id = p_order_id;
      RETURN jsonb_build_object('success', true, 'action', 'flagged_paid_after_cancel', 'needs_review', true, 'review_reason', 'paid_after_cancel', 'order_number', v_order.order_number);
    END IF;
    IF v_order.status IN ('awaiting_payment', 'pending') THEN
      IF (v_total - p_amount) > 0.01 THEN
        UPDATE public.orders SET updated_at = now(), metadata = metadata || jsonb_build_object('mp_payments', v_payments, 'mp_payment_status', 'approved', 'needs_review', true, 'review_reason', 'underpaid', 'expected_amount', v_total, 'paid_amount', p_amount, 'underpaid_payment_id', p_payment_id) WHERE id = p_order_id;
        RETURN jsonb_build_object('success', true, 'action', 'held_underpaid', 'needs_review', true, 'review_reason', 'underpaid', 'order_number', v_order.order_number);
      END IF;
      v_over := p_amount - v_total;
      -- Atualiza diretamente para 'preparing'
      UPDATE public.orders SET status = 'preparing', updated_at = now(),
        metadata = metadata || jsonb_build_object('paid_at', now(), 'mp_payment_id', p_payment_id, 'mp_payment_status', 'approved', 'mp_payments', v_payments, 'queued', true)
                            || CASE WHEN v_over > 0.01 THEN jsonb_build_object('overpaid', true, 'overpaid_amount', v_over) ELSE '{}'::jsonb END
       WHERE id = p_order_id;
      PERFORM public.increment_wait_time_sql();
      v_cres := public.confirm_coupon_use(p_order_id);
      IF (v_cres->>'needs_review')::boolean IS TRUE THEN
        v_review := true; v_reason := COALESCE(v_cres->>'review_reason', 'coupon_over_limit');
        UPDATE public.orders SET metadata = metadata || jsonb_build_object('needs_review', true, 'review_reason', v_reason) WHERE id = p_order_id;
      END IF;
      RETURN jsonb_build_object('success', true, 'action', 'order_approved', 'needs_review', v_review, 'review_reason', v_reason, 'order_number', v_order.order_number);
    END IF;
  END IF;

  IF v_order.payment_method = 'pix' THEN
    v_current := v_order.metadata->'pix'->>'payment_id';
  ELSIF v_order.payment_method = 'cartao' THEN
    SELECT e->>'payment_id' INTO v_current FROM jsonb_array_elements(COALESCE(v_order.metadata->'card_payments', '[]'::jsonb)) e
     ORDER BY (e->>'attempt_number')::int DESC NULLS LAST LIMIT 1;
  END IF;

  IF p_mp_status IN ('in_process', 'pending', 'authorized', 'cancelled', 'rejected') THEN
    IF v_current IS NOT NULL AND v_current <> p_payment_id THEN
      UPDATE public.orders SET updated_at = now(), metadata = metadata || jsonb_build_object('mp_payments', v_payments) WHERE id = p_order_id;
      RETURN jsonb_build_object('success', true, 'action', 'ignored_stale_payment_event');
    END IF;
    IF p_mp_status IN ('cancelled', 'rejected') AND v_order.status = 'awaiting_payment' AND p_mp_status = 'cancelled' AND v_order.payment_method = 'pix' THEN
      UPDATE public.orders SET status = 'cancelled', updated_at = now(),
        metadata = metadata || jsonb_build_object('mp_payments', v_payments, 'mp_payment_status', p_mp_status, 'cancel_reason', 'pix_expired_or_cancelled') WHERE id = p_order_id;
      RETURN jsonb_build_object('success', true, 'action', 'order_cancelled');
    END IF;
    UPDATE public.orders SET updated_at = now(), metadata = metadata || jsonb_build_object('mp_payments', v_payments, 'mp_payment_status', p_mp_status) WHERE id = p_order_id;
    RETURN jsonb_build_object('success', true, 'action', CASE WHEN p_mp_status IN ('in_process', 'pending', 'authorized') THEN 'recorded_in_process' ELSE 'processed_status_change' END);
  END IF;

  IF p_mp_status IN ('refunded', 'charged_back', 'in_mediation') THEN
    UPDATE public.orders SET updated_at = now(), metadata = metadata || jsonb_build_object('mp_payments', v_payments, 'needs_review', true, 'review_reason', p_mp_status, 'dispute_payment_id', p_payment_id) WHERE id = p_order_id;
    RETURN jsonb_build_object('success', true, 'action', 'flagged_dispute', 'needs_review', true, 'review_reason', p_mp_status, 'order_number', v_order.order_number);
  END IF;

  UPDATE public.orders SET updated_at = now(), metadata = metadata || jsonb_build_object('mp_payments', v_payments) WHERE id = p_order_id;
  RETURN jsonb_build_object('success', true, 'action', 'logged_event');
END;
$function$;
