const MERCADO_PAGO_PUBLIC_KEY = process.env.EXPO_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

async function callBackend(path, body, method = 'POST') {
  try {
    const response = await fetch(`${API_BASE_URL}/api/mercadopago/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    // Log de debug: mostra a resposta completa do backend no console do Expo.
    // Útil pra ver o campo "details" com o erro real do Mercado Pago.
    if (!data.success) {
      console.log(`[mercadoPago] Erro em "${path}":`, JSON.stringify(data, null, 2));
    }

    return data;
  } catch (err) {
    console.log(`[mercadoPago] Erro de conexão em "${path}":`, err.message);
    return { success: false, error: err.message || 'Erro de conexão com o servidor' };
  }
}

// ── Funções que usavam Access Token: agora passam pelo backend (Vercel) ─────

export async function createPaymentPreference(amount, orderNumber, itemsList = []) {
  return callBackend('preference', { amount, orderNumber, itemsList });
}

export async function createPixPayment(amount, email, name, orderNumber) {
  return callBackend('pix', { amount, email, name, orderNumber });
}

export async function checkPixStatus(orderId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/mercadopago/pix-status?orderId=${encodeURIComponent(orderId)}`);
    return await response.json();
  } catch (err) {
    return { success: false, error: err.message || 'Erro de conexão com o servidor' };
  }
}

export async function createCardPayment({ amount, token, paymentMethodId, email, name, docNumber, orderNumber }) {
  return callBackend('card-payment', { amount, token, paymentMethodId, email, name, docNumber, orderNumber });
}

export async function createCustomer({ email, firstName, lastName }) {
  return callBackend('customer', { email, firstName, lastName });
}

export async function saveCardToCustomer({ customerId, cardToken }) {
  return callBackend('save-card', { customerId, cardToken });
}

export async function deleteCustomerCard({ customerId, cardId }) {
  return callBackend('delete-card', { customerId, cardId }, 'DELETE');
}

// ── Funções que continuam direto no client (só usam a Public Key, é assim ──
// ── que o Checkout Transparente do Mercado Pago é projetado) ────────────────

/**
 * Tokeniza um cartão de crédito/débito utilizando a Public Key (Checkout Transparente).
 */
export async function tokenizeCard({
  cardNumber,
  expirationMonth,
  expirationYear,
  securityCode,
  cardholderName,
  docType = 'CPF',
  docNumber,
}) {
  try {
    const cleanCardNumber = cardNumber.replace(/\D/g, '');
    const cleanDocNumber = docNumber.replace(/\D/g, '');

    const response = await fetch(`https://api.mercadopago.com/v1/card_tokens?public_key=${MERCADO_PAGO_PUBLIC_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        card_number: cleanCardNumber,
        expiration_month: Number(expirationMonth),
        expiration_year: Number(expirationYear),
        security_code: securityCode,
        cardholder: {
          name: cardholderName,
          identification: {
            type: docType,
            number: cleanDocNumber,
          },
        },
      }),
    });

    const data = await response.json();
    if (response.ok) {
      if (data.luhn_validation === false) {
        return { success: false, error: 'Número do cartão inválido na validação bancária.' };
      }
      return { success: true, token: data.id };
    } else {
      return { success: false, error: data.cause?.[0]?.description || data.message || 'Erro ao tokenizar dados do cartão' };
    }
  } catch (err) {
    return { success: false, error: err.message || 'Erro de conexão com o Mercado Pago' };
  }
}

/**
 * Tokeniza o CVV de um cartão já salvo (card_id + security_code), usando a Public Key.
 */
export async function tokenizeSavedCardCvv({ cardId, securityCode }) {
  try {
    const response = await fetch(
      `https://api.mercadopago.com/v1/card_tokens?public_key=${MERCADO_PAGO_PUBLIC_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: cardId,
          security_code: securityCode,
        }),
      }
    );

    const data = await response.json();
    if (response.ok) {
      return { success: true, token: data.id };
    }
    return {
      success: false,
      error: data.cause?.[0]?.description || data.message || 'Erro ao validar CVV do cartão salvo',
    };
  } catch (err) {
    return { success: false, error: err.message || 'Erro de conexão com o Mercado Pago' };
  }
}

/**
 * Cobra com um cartão salvo: tokeniza card_id + CVV no client (Public Key),
 * depois manda pro backend cobrar (Access Token fica só no servidor).
 */
export async function chargeWithSavedCard({
  amount,
  cardId,
  securityCode,
  paymentMethodId,
  email,
  name,
  docNumber,
  orderNumber,
}) {
  const tokenResult = await tokenizeSavedCardCvv({ cardId, securityCode });
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error };
  }

  return createCardPayment({
    amount,
    token: tokenResult.token,
    paymentMethodId,
    email,
    name,
    docNumber,
    orderNumber,
  });
}

export function guessPaymentMethodId(cardNumber) {
  const clean = cardNumber.replace(/\D/g, '');
  if (clean.startsWith('4')) return 'visa';
  if (/^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[0-1]|2720)/.test(clean)) return 'master';
  if (/^(34|37)/.test(clean)) return 'amex';
  if (/^(4011|4312|4389|4514|4576|4573|5041|5067|5090|6277|6362|6363)/.test(clean)) return 'elo';
  if (/^(606282|3841)/.test(clean)) return 'hipercard';
  return 'visa'; // default fallback
}
