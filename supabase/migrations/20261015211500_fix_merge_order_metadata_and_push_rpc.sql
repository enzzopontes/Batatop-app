-- 1. Fix merge_order_metadata parameter names to match Site-da-mara Next.js backend:
--    (order_id uuid, patch jsonb)
DROP FUNCTION IF EXISTS public.merge_order_metadata(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.merge_order_metadata(order_id uuid, patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF patch IS NULL OR jsonb_typeof(patch) <> 'object' THEN
    RAISE EXCEPTION 'patch must be a JSON object';
  END IF;

  -- Allow service_role (v_caller IS NULL), order owner, or admin
  IF v_caller IS NOT NULL AND NOT public.is_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = merge_order_metadata.order_id
        AND o.user_id = v_caller
    ) THEN
      RAISE EXCEPTION 'Not authorized to update metadata for order %', order_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.orders o
  SET
    metadata = COALESCE(o.metadata, '{}'::jsonb) || patch,
    updated_at = now()
  WHERE o.id = merge_order_metadata.order_id
  RETURNING o.metadata INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', order_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_order_metadata(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_order_metadata(uuid, jsonb) TO authenticated, service_role;

-- 2. Fix dispatch_admin_new_order_push: remove non-existent "phone" column from orders query
CREATE OR REPLACE FUNCTION public.dispatch_admin_new_order_push(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
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
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT
    o.id,
    o.user_id,
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
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sent', false, 'reason', 'order_not_found');
  END IF;

  IF v_order.user_id IS DISTINCT FROM v_caller AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: not order owner or admin' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(DISTINCT t.expo_push_token)
  INTO v_tokens
  FROM public.admin_push_tokens t
  WHERE t.expo_push_token IS NOT NULL
    AND length(trim(t.expo_push_token)) > 0;

  IF v_tokens IS NULL OR array_length(v_tokens, 1) IS NULL THEN
    RETURN jsonb_build_object('sent', false, 'reason', 'no_admin_tokens');
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
    ELSE '#' || upper( left(v_order.id::text, 6) )
  END;

  v_delivery_label := CASE
    WHEN v_order.delivery_type = 'pickup' THEN '🏪 Retirada no local'
    ELSE '🛵 Entrega'
  END;

  v_title := format('🍟 Novo Pedido %s — R$ %s',
    v_num_label,
    replace(to_char(COALESCE(v_order.total_amount, 0), 'FM999990D00'), '.', ',')
  );

  v_body := concat_ws(
    E'\n',
    format('👤 %s • 📞 %s', COALESCE(v_order.customer_name, 'Cliente'), COALESCE(v_order.customer_phone, 'S/ telefone')),
    v_delivery_label,
    CASE WHEN v_order.delivery_type IS DISTINCT FROM 'pickup' AND v_order.customer_address IS NOT NULL
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
        'sound', 'default',
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

  RETURN jsonb_build_object(
    'sent', true,
    'token_count', array_length(v_tokens, 1),
    'request_id', v_req_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_admin_new_order_push(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_admin_new_order_push(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
