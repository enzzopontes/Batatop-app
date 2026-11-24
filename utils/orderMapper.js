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
    const pastaType =
      String(item.pastaType || item.pasta_type || '').trim().slice(0, 50).trim() || null;

    const adicionaisMap = new Map();
    if (Array.isArray(item.adicionais)) {
      for (const adic of item.adicionais) {
        if (!adic || typeof adic !== 'object') continue;

        const rawAdicQty = Number(adic.quantity ?? adic.quantidade ?? 1);
        const adicQty = Math.max(
          1,
          Math.min(99, Math.floor(Number.isNaN(rawAdicQty) ? 1 : rawAdicQty))
        );
        const rawAdicId = String(adic.id || '').trim();
        const adicId = rawAdicId.length >= 36 ? rawAdicId.slice(0, 36) : rawAdicId;
        const isValidId = UUID_REGEX.test(adicId);

        if (isValidId) {
          const key = `id:${adicId.toLowerCase()}`;
          const existing = adicionaisMap.get(key);
          if (existing) {
            existing.quantity = Math.max(1, Math.min(99, existing.quantity + adicQty));
          } else {
            adicionaisMap.set(key, { quantity: adicQty, id: adicId });
          }
        } else if (adic.name || adic.nome) {
          const adicName = String(adic.name || adic.nome).trim();
          if (!adicName) continue;
          const key = `name:${adicName.toUpperCase()}`;
          const existing = adicionaisMap.get(key);
          if (existing) {
            existing.quantity = Math.max(1, Math.min(99, existing.quantity + adicQty));
          } else {
            adicionaisMap.set(key, { quantity: adicQty, name: adicName });
          }
        }
      }
    }
    const adicionais = Array.from(adicionaisMap.values());

    return {
      product_id: productId,
      quantity,
      notes,
      pasta_type: pastaType,
      adicionais,
    };
  });
}
