import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const ADMIN_ORDERS_CHANNEL_ID = 'new-orders';

function buildNewOrderPushContent(order, items = []) {
  const orderLabel = order.order_number
    ? `#${order.order_number}`
    : `#${String(order.id).slice(-4).toUpperCase()}`;

  const customer = order.customer_name || 'Cliente';

  const totalFromOrder = order.total_amount ?? order.total ?? order.total_price;
  const totalFromItems = items.reduce((sum, item) => {
    const price = item.product_price ?? item.price ?? 0;
    const qty = item.quantity ?? 1;
    return sum + price * qty;
  }, 0);
  const total = totalFromOrder ?? totalFromItems;
  const totalFmt = total
    ? ` — R$ ${total.toFixed(2).replace('.', ',')}`
    : '';

  const maxItems = 5;
  const itemLines = items.slice(0, maxItems).map((item) => {
    const name = item.product_name || item.name || 'Item';
    const qty = item.quantity || 1;
    const price = item.product_price ?? item.price;
    const priceFmt = price != null
      ? ` .. R$ ${(price * qty).toFixed(2).replace('.', ',')}`
      : '';
    const adicionais = (item.adicionais || [])
      .map((a) => (typeof a === 'string' ? a : a?.name))
      .filter(Boolean);
    const adicText = adicionais.length ? `\n   + ${adicionais.join(', ')}` : '';
    return `${qty}x ${name}${priceFmt}${adicText}`;
  });

  const extra = items.length > maxItems
    ? `\n+${items.length - maxItems} item(ns)`
    : '';

  const body = [
    `${customer}${totalFmt}`,
    '─────────────────',
    ...itemLines,
    extra,
    '─────────────────',
    'Toque para gerenciar',
  ].filter(Boolean).join('\n');

  return {
    title: `Novo Pedido ${orderLabel}`,
    subtitle: `${customer}${totalFmt}`,
    body,
    data: {
      orderId: order.id,
      screen: 'admin/pedidos',
      url: '/admin/pedidos',
    },
  };
}

async function sendExpoPush(messages) {
  if (!messages.length) return { ok: true, sent: 0 };

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  const result = await response.json();
  return { ok: response.ok, result };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    const userJwt = authHeader.replace(/^Bearer\s+/i, '');

    if (!userJwt) {
      return new Response(JSON.stringify({ success: false, error: 'Token de autenticação obrigatório' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const { orderId } = await req.json();
    if (!orderId) {
      return new Response(JSON.stringify({ success: false, error: 'orderId obrigatorio' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(userJwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Usuário não autenticado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, order_items (*)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ success: false, error: 'Pedido nao encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Verificar se chamador é dono ou admin
    const ADMIN_EMAILS = ['enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com'];
    let isAdmin = ADMIN_EMAILS.includes(user.email || '');
    if (!isAdmin) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (prof?.role === 'admin') {
        isAdmin = true;
      }
    }
    const isOwner = order.user_id === user.id;

    if (!isAdmin && !isOwner) {
      return new Response(JSON.stringify({ success: false, error: 'Acesso negado: você não é dono nem admin deste pedido' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Anti-duplicação: se já foi notificado, ignora
    if (order.metadata?.admin_push_sent) {
      return new Response(JSON.stringify({ success: true, message: 'Notificação já enviada anteriormente', skipped: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const { data: tokens, error: tokenError } = await supabase
      .from('admin_push_tokens')
      .select('expo_push_token');

    if (tokenError) {
      return new Response(JSON.stringify({ success: false, error: tokenError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const uniqueTokens = [...new Set((tokens || []).map((t) => t.expo_push_token).filter(Boolean))];
    const content = buildNewOrderPushContent(order, order.order_items || []);

    const messages = uniqueTokens.map((to) => ({
      to,
      title: content.title,
      subtitle: content.subtitle,
      body: content.body,
      sound: 'new_order.mp3',
      priority: 'high',
      channelId: ADMIN_ORDERS_CHANNEL_ID,
      data: content.data,
      android: {
        channelId: ADMIN_ORDERS_CHANNEL_ID,
        priority: 'max',
        sound: 'new_order.mp3',
        color: '#FFB800',
      },
      ios: {
        sound: 'new_order.mp3',
        subtitle: content.subtitle,
      },
    }));

    const pushResult = await sendExpoPush(messages);

    return new Response(JSON.stringify({
      success: true,
      sent: messages.length,
      push: pushResult,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Erro interno' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
