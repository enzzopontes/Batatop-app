import { useState, useCallback } from 'react';
import { supabase } from '../supabaseConfig';

/**
 * Mapeia uma row da tabela `orders` (com order_items joinado) pro formato
 * que o app consome — espelhando o mapOrderData() do orders-manager.ts do site.
 */
const mapOrderData = (o) => {
  let items = [];

  if (o.order_items && o.order_items.length > 0) {
    // Prioridade 1: tabela order_items (join)
    items = o.order_items.map((item) => ({
      id: item.product_id,
      name: item.product_name,
      quantity: item.quantity,
      price: Number(item.product_price),
      adicionais: item.adicionais || [],
      pastaType: item.pasta_type || undefined,
      notes: item.notes || '',
    }));
  } else if (o.metadata?.items && o.metadata.items.length > 0) {
    // Fallback: metadata.items (pedidos antigos)
    items = o.metadata.items.map((item) => ({
      id: item.product_id || item.id,
      name: item.product_name || item.name,
      quantity: item.quantity,
      price: Number(item.product_price || item.price),
      adicionais: item.adicionais || [],
      pastaType: item.pastaType || item.pasta_type || undefined,
      notes: item.notes || '',
    }));
  }

  const isUnderpaidReview =
    Boolean(o.metadata?.needs_review && o.metadata?.review_reason === 'underpaid') ||
    o.metadata?.review_reason === 'underpaid';

  const isPaid =
    !isUnderpaidReview &&
    (Boolean(o.metadata?.paid_at) ||
      ['preparing', 'preparo', 'ready', 'out_for_delivery', 'delivered'].includes(o.status));

  const normalizedStatus =
    (o.status === 'awaiting_payment' || o.status === 'pending') && isPaid
      ? 'preparing'
      : o.status;

  return {
    id: o.id,
    orderNumber: o.order_number || 0,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    items,
    total: Number(o.total_amount),
    status: normalizedStatus,
    paymentMethod: o.payment_method,
    deliveryType: o.delivery_type || 'delivery',
    address: o.customer_address,
    neighborhood: o.customer_neighborhood || '',
    complement: o.customer_complement || '',
    createdAt: new Date(o.created_at),
    notes: o.notes || '',
    discountAmount: Number(o.discount_amount || 0),
    couponCode: o.coupon_code || null,
    user_id: o.user_id || null,
    metadata: o.metadata || null,
    deliveryLat: o.delivery_lat ?? o.metadata?.delivery_lat ?? null,
    deliveryLng: o.delivery_lng ?? o.metadata?.delivery_lng ?? null,
    needsReview: Boolean(o.metadata?.needs_review),
    reviewReason: o.metadata?.review_reason || null,
    isUnderpaidReview,
  };
};

const PIX_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutos

async function checkAndAutoCancelPix(order) {
  if (!order) return order;
  const isUnderpaidReview = Boolean(
    order.isUnderpaidReview ||
      order.metadata?.review_reason === 'underpaid' ||
      (order.metadata?.needs_review && order.metadata?.review_reason === 'underpaid')
  );
  if (isUnderpaidReview) return order;

  const isPaid =
    Boolean(order.metadata?.paid_at) ||
    ['preparing', 'preparo', 'ready', 'out_for_delivery', 'delivered'].includes(order.status);

  if (isPaid) return order;

  const isPixAwaiting =
    order.status === 'awaiting_payment' ||
    (order.status === 'pending' &&
      (order.payment_method === 'pix' ||
        order.paymentMethod === 'pix' ||
        order.metadata?.pix ||
        order.metadata?.qr_code));

  if (!isPixAwaiting) return order;

  const createdAt = order.created_at
    ? new Date(order.created_at).getTime()
    : order.createdAt
    ? new Date(order.createdAt).getTime()
    : Date.now();
  const age = Date.now() - createdAt;

  if (age >= PIX_EXPIRATION_MS) {
    try {
      const { error: cancelErr } = await supabase.rpc('cancel_order_user', {
        p_order_id: order.id,
        p_cancel_reason: 'pix_expirado_30min',
      });
      if (!cancelErr) {
        return { ...order, status: 'cancelled' };
      }
    } catch {
      return order;
    }
    return order;
  }

  return order;
}

export const usePedidos = () => {
  const [error, setError] = useState(null);

  /**
   * Busca todos os pedidos de um usuário pelo user_id (Supabase Auth).
   * Faz join com order_items igual ao site.
   */
  const buscarPedidosPorUsuario = useCallback(async (userId) => {
    if (!userId) return { success: false, error: 'userId obrigatório', data: [] };

    try {
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('orders')
        .select('*, order_items (*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const mapped = (data || []).map(mapOrderData);
      const checked = await Promise.all(mapped.map(checkAndAutoCancelPix));

      return { success: true, data: checked };
    } catch (err) {
      console.error('Erro ao buscar pedidos do usuário:', err);
      setError(err.message);
      return { success: false, error: err.message, data: [] };
    }
  }, []);

  /**
   * Busca um pedido específico pelo id (para tela de detalhes).
   */
  const buscarPedidoPorId = useCallback(async (pedidoId) => {
    try {
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('orders')
        .select('*, order_items (*)')
        .eq('id', pedidoId)
        .single();

      if (fetchError) throw fetchError;

      const mapped = mapOrderData(data);
      const checked = await checkAndAutoCancelPix(mapped);
      return { success: true, data: checked };
    } catch (err) {
      console.error('Erro ao buscar pedido:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, []);

  return {
    error,
    buscarPedidosPorUsuario,
    buscarPedidoPorId,
  };
};