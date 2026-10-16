-- ==============================================================================
-- Migration: 20261015201000_add_dispatch_admin_new_order_push_rpc.sql
-- RPC segura dispatch_admin_new_order_push: dispara notificação push de novo pedido
-- diretamente do Postgres via pg_net para Expo Push API sem vazar tokens para o cliente
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.dispatch_admin_new_order_push(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order record;
  v_items text;
  v_tokens text[];
  v_token text;
  v_messages jsonb := '[]'::jsonb;
  v_title text;
  v_subtitle text;
  v_body text;
  v_order_label text;
  v_total text;
  v_delivery_type text;
  v_address text;
  v_payment text;
  v_phone text;
  v_req_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- 1. Verifica se o pedido existe e pertence ao usuário (ou se é admin)
  SELECT id, order_number, customer_name, customer_phone, phone,
         delivery_type, customer_address, customer_complement, customer_neighborhood,
         payment_method, total_amount, notes, user_id
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_order.user_id IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden_not_owner';
  END IF;

  -- 2. Busca tokens dos administradores
  SELECT array_agg(DISTINCT expo_push_token)
  INTO v_tokens
  FROM public.admin_push_tokens
  WHERE expo_push_token IS NOT NULL 
    AND (expo_push_token LIKE 'ExponentPushToken[%' OR expo_push_token LIKE 'ExpoPushToken[%');

  IF v_tokens IS NULL OR array_length(v_tokens, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_admin_tokens_registered');
  END IF;

  -- 3. Formata texto rico do pedido e itens
  v_order_label := COALESCE('#' || v_order.order_number::text, '#' || upper(right(p_order_id::text, 4)));
  v_total := 'R$ ' || trim(to_char(COALESCE(v_order.total_amount, 0), 'FM999990.00'));
  
  IF v_order.delivery_type = 'retirada' THEN
    v_delivery_type := 'Retirada no Balcão';
    v_address := 'Balcão da Loja';
  ELSE
    v_delivery_type := 'Entrega Delivery';
    v_address := COALESCE(v_order.customer_address, 'Endereço não informado')
      || CASE WHEN v_order.customer_complement IS NOT NULL AND v_order.customer_complement != '' THEN ' (' || v_order.customer_complement || ')' ELSE '' END
      || CASE WHEN v_order.customer_neighborhood IS NOT NULL AND v_order.customer_neighborhood != '' THEN ' - ' || v_order.customer_neighborhood ELSE '' END;
  END IF;

  v_payment := CASE 
    WHEN v_order.payment_method = 'pix' THEN 'Pix'
    WHEN v_order.payment_method = 'dinheiro' THEN 'Dinheiro'
    ELSE 'Cartão'
  END;

  v_phone := COALESCE(v_order.customer_phone, v_order.phone, '');

  SELECT string_agg(
    item_row, ' | '
  )
  INTO v_items
  FROM (
    SELECT quantity || 'x ' || COALESCE(product_name, 'Item') || 
      CASE 
        WHEN adicionais IS NOT NULL AND jsonb_array_length(CASE WHEN jsonb_typeof(adicionais) = 'array' THEN adicionais ELSE '[]'::jsonb END) > 0 
        THEN ' (+ ' || (
          SELECT string_agg(
            COALESCE(elem->>'name', elem->>'nome', elem#>>'{}'),
            ', '
          )
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(adicionais) = 'array' THEN adicionais ELSE '[]'::jsonb END) elem
        ) || ')'
        ELSE ''
      END AS item_row
    FROM public.order_items
    WHERE order_id = p_order_id
    LIMIT 8
  ) sub;

  IF v_items IS NULL OR v_items = '' THEN
    v_items := 'Itens no pedido';
  END IF;

  v_title := '🚨 NOVO PEDIDO ' || v_order_label || ' • ' || COALESCE(v_order.customer_name, 'Cliente');
  v_subtitle := COALESCE(v_order.customer_name, 'Cliente') || ' — ' || v_total;
  
  v_body := '💰 ' || v_total || ' (' || v_payment || ')' || E'\n'
         || '📦 ' || v_delivery_type || ' • ' || v_address || E'\n'
         || '🍽️ ' || v_items
         || CASE WHEN v_phone != '' THEN E'\n' || '📞 Tel: ' || v_phone ELSE '' END
         || CASE WHEN v_order.notes IS NOT NULL AND v_order.notes != '' THEN E'\n' || '📝 Obs: ' || v_order.notes ELSE '' END;

  -- 4. Monta array de payloads Expo Push
  FOREACH v_token IN ARRAY v_tokens LOOP
    v_messages := v_messages || jsonb_build_array(
      jsonb_build_object(
        'to', v_token,
        'sound', 'new_order.mp3',
        'channelId', 'new-orders',
        'priority', 'high',
        'title', v_title,
        'subtitle', v_subtitle,
        'body', v_body,
        'data', jsonb_build_object(
          'orderId', p_order_id,
          'screen', 'admin/pedidos',
          'url', '/admin/pedidos'
        )
      )
    );
  END LOOP;

  -- 5. Dispara requisição HTTP assíncrona via pg_net
  SELECT net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := v_messages,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  ) INTO v_req_id;

  RETURN jsonb_build_object(
    'success', true,
    'tokens_count', array_length(v_tokens, 1),
    'net_request_id', v_req_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_admin_new_order_push(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_admin_new_order_push(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.dispatch_admin_new_order_push(uuid) TO authenticated;
