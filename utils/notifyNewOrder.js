import { supabase } from '../supabaseConfig';
import { getEffectiveSession } from './authSession';
import { buildNewOrderPushContent } from './orderNotificationContent';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

/**
 * Dispara push notification para todos os admins registrados.
 * 1. Busca dados completos do pedido + itens no Supabase.
 * 2. Monta texto rico com todas as informações (itens, endereço, valor, etc.).
 * 3. Obtém tokens dos admins via RPC (get_admin_push_tokens) com SECURITY DEFINER.
 * 4. Dispara direto para a Expo Push API (https://exp.host/--/api/v2/push/send).
 * 5. Tenta Edge Function / API como fallback redundante.
 */
export async function notifyAdminNewOrder(orderId) {
  if (!orderId) return;

  try {
    // 1. Busca dados do pedido e itens
    let order = null;
    let items = [];

    const { data: orderData, error: orderErr } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, customer_name, customer_phone,
        delivery_type, customer_address, customer_complement, customer_neighborhood,
        payment_method, total_amount, discount_amount, notes, created_at,
        order_items (
          id, product_name, quantity, product_price, adicionais
        )
      `)
      .eq('id', orderId)
      .maybeSingle();

    if (!orderErr && orderData) {
      order = orderData;
      items = orderData.order_items || [];
    } else {
      // Fallback: busca pedido simples e itens separados
      const { data: simpleOrder } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();

      if (simpleOrder) {
        order = simpleOrder;
        const { data: itemRows } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', orderId);
        items = itemRows || [];
      }
    }

    if (!order) {
      console.warn('[notify] Pedido não encontrado para notificação:', orderId);
      return;
    }

    if (order.status === 'awaiting_payment') {
      console.log('[notify] Pedido aguardando pagamento, push ignorado:', orderId);
      return;
    }

    // 2. Constrói conteúdo rico da notificação
    const pushContent = buildNewOrderPushContent(order, items);

    // 3. Disparo seguro server-side via RPC Postgres (dispatch_admin_new_order_push) com pg_net
    // Mantém tokens dos administradores 100% blindados dentro do banco
    let dispatchedViaRpc = false;
    try {
      const { data: rpcRes, error: rpcDispatchErr } = await supabase.rpc('dispatch_admin_new_order_push', {
        p_order_id: orderId,
      });
      if (!rpcDispatchErr && (rpcRes?.success || rpcRes?.sent || rpcRes?.already_sent)) {
        dispatchedViaRpc = true;
        if (__DEV__) {
          console.log('[notify] Push disparado com sucesso via pg_net no Postgres:', rpcRes);
        }
        return;
      }
    } catch (_) {}

    // 4. Fallback client-side (se o chamador for admin autenticado)
    const { data: rpcTokens, error: rpcErr } = await supabase.rpc('get_admin_push_tokens');
    if (rpcErr) {
      console.warn('[notify] RPC get_admin_push_tokens restrita:', rpcErr.message);
    }

    const tokensList = Array.isArray(rpcTokens) ? rpcTokens : [];
    const pushTokens = tokensList
      .map((t) => (typeof t === 'string' ? t : t?.expo_push_token || t?.token))
      .filter((t) => typeof t === 'string' && (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken[')));

    // 5. Envia para a API da Expo se houver tokens
    if (pushTokens.length > 0) {
      const messages = pushTokens.map((token) => ({
        to: token,
        sound: 'new_order.mp3',
        channelId: 'new-orders',
        priority: 'high',
        title: pushContent.title,
        subtitle: pushContent.subtitle,
        body: pushContent.body,
        data: pushContent.data,
      }));

      try {
        const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(messages),
        });

        if (!expoRes.ok) {
          console.warn('[notify] Expo push API status:', expoRes.status);
        } else {
          const expoJson = await expoRes.json();
          if (__DEV__) {
            console.log('[notify] Push disparado com sucesso para admins:', expoJson);
          }
        }
      } catch (expoErr) {
        console.warn('[notify] Falha ao enviar para Expo push API:', expoErr?.message || expoErr);
      }
    } else {
      if (__DEV__) {
        console.log('[notify] Nenhum token admin registrado no momento');
      }
    }

    // 5. Fallback redundante para Edge Function / API Vercel
    try {
      const { data, error } = await supabase.functions.invoke('notify-admin-order', {
        body: { orderId },
      });
      if (!error && data?.success !== false) return;
    } catch (_) {}

    if (API_BASE_URL) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        await fetch(`${API_BASE_URL}/api/notify-new-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionData?.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {}),
          },
          body: JSON.stringify({ orderId }),
        });
      } catch (_) {}
    }
  } catch (globalErr) {
    console.warn('[notify] Erro geral ao notificar admin:', globalErr?.message || globalErr);
  }
}
