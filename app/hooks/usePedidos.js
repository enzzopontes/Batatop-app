import { useState } from 'react';
import { supabase } from '../../supabaseConfig';

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
      pastaType: item.pasta_type || null,
    }));
  } else if (o.metadata?.items && o.metadata.items.length > 0) {
    // Fallback: metadata.items (pedidos antigos)
    items = o.metadata.items.map((item) => ({
      id: item.product_id || item.id,
      name: item.product_name || item.name,
      quantity: item.quantity,
      price: Number(item.product_price || item.price),
      adicionais: item.adicionais || [],
      pastaType: item.pastaType || null,
    }));
  }

  return {
    id: o.id,
    orderNumber: o.order_number || 0,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    items,
    total: Number(o.total_amount),
    status: o.status,
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
  };
};

export const usePedidos = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Busca todos os pedidos de um usuário pelo user_id (Supabase Auth).
   * Faz join com order_items igual ao site.
   */
  const buscarPedidosPorUsuario = async (userId) => {
    if (!userId) return { success: false, error: 'userId obrigatório', data: [] };

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('orders')
        .select('*, order_items (*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      return { success: true, data: (data || []).map(mapOrderData) };
    } catch (err) {
      console.error('Erro ao buscar pedidos do usuário:', err);
      setError(err.message);
      return { success: false, error: err.message, data: [] };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Busca um pedido específico pelo id (para tela de detalhes).
   */
  const buscarPedidoPorId = async (pedidoId) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('orders')
        .select('*, order_items (*)')
        .eq('id', pedidoId)
        .single();

      if (fetchError) throw fetchError;

      return { success: true, data: mapOrderData(data) };
    } catch (err) {
      console.error('Erro ao buscar pedido:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    buscarPedidosPorUsuario,
    buscarPedidoPorId,
  };
};