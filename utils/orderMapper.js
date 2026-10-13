const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mapeia os itens do carrinho do App para o formato esperado pelo banco (create_order).
 * 
 * Regras:
 * - product_id: primeiros 36 caracteres se vier "uuid-timestamp" (validação UUID relaxado 8-4-4-4-12 hex)
 * - quantity: número inteiro entre 1 e 99
 * - notes: observações do item ou null
 * - pasta_type: tipo de massa ou null
 * - adicionais: array de { id?, name?, quantity } (NUNCA envia price)
 */
export function mapCartItemsToOrderItems(items) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const rawId = String(item.product_id || item.id || '').trim();
    const productId = rawId.length >= 36 ? rawId.slice(0, 36) : rawId;

    if (!UUID_REGEX.test(productId)) {
      throw new Error(`invalid_product_id: ${rawId}`);
    }

    const rawQty = Number(item.quantity ?? item.quantidade ?? 1);
    const quantity = Math.max(1, Math.min(99, Math.floor(isNaN(rawQty) ? 1 : rawQty)));

    const notes = (item.notes || item.observacoes || '').trim() || null;
    const pastaType = item.pasta_type || item.pastaType || null;

    const adicionais = Array.isArray(item.adicionais)
      ? item.adicionais.map((adic) => {
          const adicQty = Math.max(1, Math.floor(Number(adic.quantity ?? adic.quantidade ?? 1)));
          const rawAdicId = String(adic.id || '').trim();
          const adicId = rawAdicId.length >= 36 ? rawAdicId.slice(0, 36) : rawAdicId;
          const isValidId = UUID_REGEX.test(adicId);

          const mappedAdic = { quantity: adicQty };
          if (isValidId) {
            mappedAdic.id = adicId;
          } else if (adic.name || adic.nome) {
            mappedAdic.name = String(adic.name || adic.nome).trim();
          }
          return mappedAdic;
        })
      : [];

    return {
      product_id: productId,
      quantity,
      notes,
      pasta_type: pastaType,
      adicionais,
    };
  });
}
