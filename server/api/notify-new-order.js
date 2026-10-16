/**
 * Vercel Serverless: POST /api/notify-new-order
 *
 * Copie este arquivo para o projeto da Vercel em:
 *   api/notify-new-order.js
 *
 * Env vars necessarias no painel Vercel (Settings > Environment Variables):
 *   SUPABASE_URL=https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=... (chave service_role do Supabase, NAO a anon)
 */

const { createClient } = require('@supabase/supabase-js');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const ADMIN_ORDERS_CHANNEL_ID = 'new-orders';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao configuradas na Vercel');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function buildNewOrderPushContent(order, items = []) {
  const orderLabel = order.order_number
    ? `#${order.order_number}`
    : `#${String(order.id).slice(-4).toUpperCase()}`;

  const itemLines = items.slice(0, 5).map((item) => {
    const name = item.product_name || item.name || 'Item';
    const qty = item.quantity || 1;
    const adicionais = (item.adicionais || [])
      .map((a) => (typeof a === 'string' ? a : a?.name))
      .filter(Boolean);
    const adicText = adicionais.length ? `\n   + ${adicionais.join(', ')}` : '';
    return `${qty}x ${name}${adicText}`;
  });

  const extra = items.length > 5 ? `\n+${items.length - 5} item(ns)` : '';
  const customer = order.customer_name || 'Cliente';

  const body = [
    customer,
    '────────────────',
    ...itemLines,
    extra,
    '────────────────',
    'Toque para gerenciar o pedido',
  ].filter(Boolean).join('\n');

  return {
    title: `Novo Pedido ${orderLabel}`,
    subtitle: customer,
    body,
    data: {
      orderId: order.id,
      screen: 'admin/pedidos',
      url: '/admin/pedidos',
    },
  };
}

async function supabaseFetch(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao configuradas na Vercel');
  }

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase ${response.status}: ${text}`);
  }

  if (response.status === 204) return null;
  return response.json();
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    const authHeader = req.headers?.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : authHeader.trim();
    const token = bearerToken || req.headers?.['x-webhook-secret'] || '';

    const isWebhookAuthorized = Boolean(
      process.env.NOTIFY_WEBHOOK_SECRET && token === process.env.NOTIFY_WEBHOOK_SECRET,
    );

    let authData = null;
    if (!isWebhookAuthorized) {
      if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { data: userRes, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !userRes?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      authData = userRes;
    }

    const { orderId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId obrigatorio' });
    }

    const orders = await supabaseFetch(
      `orders?id=eq.${encodeURIComponent(orderId)}&select=*,order_items(*)`,
    );

    const order = orders?.[0];
    if (!order) {
      return res.status(404).json({ success: false, error: 'Pedido nao encontrado' });
    }

    if (!isWebhookAuthorized) {
      if (order.user_id !== authData.user.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (profile?.role !== 'admin') {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }
    }

    if (order.status === 'awaiting_payment') {
      return res.status(200).json({ success: false, skipped: 'awaiting_payment' });
    }

    if (order.metadata?.admin_push_sent === true) {
      return res.status(200).json({ success: true, alreadySent: true });
    }

    const tokens = await supabaseFetch(
      'admin_push_tokens?select=expo_push_token',
    );

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
        color: '#1A1A1A',
      },
      ios: {
        sound: 'new_order.mp3',
        subtitle: content.subtitle,
      },
    }));

    const pushResult = await sendExpoPush(messages);

    if (pushResult.ok) {
      await supabase
        .from('orders')
        .update({
          metadata: { ...(order.metadata || {}), admin_push_sent: true },
        })
        .eq('id', order.id);
    }

    return res.status(200).json({
      success: true,
      sent: messages.length,
      push: pushResult,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e?.message || 'Erro interno',
    });
  }
};
