/**
 * Formata título e corpo da push de novo pedido contendo todas as informações
 * do pedido para os administradores.
 */
export function buildNewOrderPushContent(order, items = []) {
  const orderLabel = order.order_number
    ? `#${order.order_number}`
    : `#${String(order.id).slice(-4).toUpperCase()}`;

  const customer = order.customer_name || 'Cliente';
  const customerPhone = order.customer_phone || order.phone || '';
  const isRetirada = order.delivery_type === 'retirada' || order.delivery_type === 'pickup';
  const deliveryType = isRetirada ? 'Retirada no Balcão' : 'Entrega Delivery';

  const paymentLabel =
    order.payment_method === 'pix'
      ? 'Pix'
      : order.payment_method === 'dinheiro'
      ? 'Dinheiro'
      : order.payment_method?.toLowerCase()?.includes('deb')
      ? 'Cartão de Débito'
      : order.payment_method?.toLowerCase()?.includes('cred')
      ? 'Cartão de Crédito'
      : 'Cartão';

  const address = order.customer_address
    ? `${order.customer_address}${order.customer_complement ? ` (${order.customer_complement})` : ''}${order.customer_neighborhood ? ` - ${order.customer_neighborhood}` : ''}`
    : isRetirada
    ? 'Loja (Retirada)'
    : 'Endereço não informado';

  const totalFromOrder = order.total_amount ?? order.total ?? order.total_price;
  const totalFromItems = (items || []).reduce((sum, item) => {
    const price = item.product_price ?? item.price ?? 0;
    const qty = item.quantity ?? 1;
    return sum + price * qty;
  }, 0);
  const total = totalFromOrder ?? totalFromItems;
  const totalFmt = total != null
    ? `R$ ${Number(total).toFixed(2).replace('.', ',')}`
    : '';

  const itemLines = (items || []).slice(0, 6).map((item) => {
    const name = item.product_name || item.name || 'Item';
    const qty = item.quantity || 1;
    const adicionais = (item.adicionais || [])
      .map((a) => (typeof a === 'string' ? a : a?.name || a?.nome))
      .filter(Boolean);
    const adicText = adicionais.length ? ` (+ ${adicionais.join(', ')})` : '';
    return `${qty}x ${name}${adicText}`;
  });

  const extraCount = (items || []).length > 6 ? ` (+${items.length - 6} itens)` : '';

  const bodyLines = [
    `${totalFmt} • ${paymentLabel} • ${deliveryType}`,
    `${address}`,
    itemLines.join(' | ') + extraCount,
  ];

  const cleanPhone = (customerPhone || '').trim();
  if (cleanPhone) bodyLines.push(`Contato: ${cleanPhone}`);
  const cleanNotes = (order.notes || '').trim();
  if (cleanNotes) bodyLines.push(`Obs: ${cleanNotes}`);

  const body = bodyLines.filter(Boolean).join('\n');

  return {
    title: `Novo pedido ${orderLabel} • ${customer}`,
    subtitle: `${customer} — ${totalFmt}`,
    body,
    data: {
      orderId: order.id,
      screen: 'admin/pedidos',
      url: '/admin/pedidos',
    },
  };
}
