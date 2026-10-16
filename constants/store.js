/**
 * constants/store.js
 *
 * Constantes da loja usadas no fluxo sacola -> pagamento (app/cart.tsx).
 * Sem coluna no banco propositalmente (fase 1 do refactor confirmou que
 * nao existe). Se algum dia virar configuravel por admin, migrar pra
 * store_settings — o app ja le `store_status.isDeliveryFeeEnabled` de la
 * (flag do site: taxa ativa ou frete gratis).
 */

// Pedido minimo da sacola. 0 = desativado (aviso e sheet nao aparecem).
export const MIN_ORDER_VALUE = 0;

// Taxa de entrega padrao. Cobrada so quando `isDeliveryFeeEnabled` esta
// ativo em store_settings.store_status (lido na /cart). Divergencia
// conhecida: o site tem `deliveryFee` configuravel (default 3.00) — aqui
// o valor e fixo.
export const DELIVERY_FEE = 5.0;

// Texto de prazo estimado exibido na etapa de entrega.
export const DELIVERY_ETA_TEXT = '15 a 22 min';

// Endereco da loja (retirada).
export const STORE_ADDRESS = {
  street: 'Rua Carlos Roberto Crepaldi',
  number: '120',
  neighborhood: 'Centro',
  city: 'Iacanga',
  uf: 'SP',
  full: 'Rua Carlos Roberto Crepaldi, 120',
  displayLine2: 'Batata Top - Centro, Iacanga - SP',
  latitude: -21.8402,
  longitude: -49.0058,
};
