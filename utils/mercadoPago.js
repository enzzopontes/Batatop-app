import { getEffectiveSession } from './authSession';

const MERCADO_PAGO_PUBLIC_KEY = process.env.EXPO_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://batatatop.vercel.app';

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callBackend(path, body, method = 'POST', timeoutMs = null) {
  try {
    const session = await getEffectiveSession();
    const token = session?.access_token || '';

    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const fetchFn = timeoutMs ? (url, opts) => fetchWithTimeout(url, opts, timeoutMs) : fetch;

    const response = await fetchFn(`${API_BASE_URL}/api/mercadopago/${path}`, {
      method,
      headers,
      body: method !== 'GET' && method !== 'HEAD' ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));

    // Se o backend respondeu com erro ou success false
    if (!response.ok || !data.success) {
      console.log(`[mercadoPago] Erro em "${path}":`, data.error || response.status);
      return {
        success: false,
        status: data.status,
        statusDetail: data.statusDetail || data.status_detail,
        error: data.error || (response.status === 500 ? 'Erro de configuração no servidor' : 'Erro no processamento'),
        details: data.details,
      };
    }

    return data;
  } catch (err) {
    console.log(`[mercadoPago] Erro de conexão em "${path}":`, err.message);
    return { success: false, error: err.message || 'Erro de conexão com o servidor' };
  }
}

// ── Funções que passam pelo backend (Vercel) com Access Token ────────────────

/**
 * Cria preferência de pagamento no Mercado Pago.
 * Valor, itens e e-mail vêm do banco/sessão no backend através do orderId.
 */
export async function createPaymentPreference(param) {
  const orderId = typeof param === 'string' ? param : (param?.orderId || param);
  return callBackend('preference', { orderId });
}

/**
 * Gera cobrança via Pix no Mercado Pago.
 * Valor e e-mail do pagador são consultados no backend usando o orderId.
 */
export async function createPixPayment(param) {
  const orderId = typeof param === 'string' ? param : (param?.orderId || param);
  return callBackend('pix', { orderId });
}

/**
 * Consulta de status do Pix.
 */
export async function checkPixStatus(id) {
  try {
    return await callBackend(`pix-status?id=${encodeURIComponent(id)}`, null, 'GET', 15000);
  } catch (err) {
    return { success: false, error: err.message || 'Erro de conexão com o servidor' };
  }
}

/**
 * Processa pagamento com cartão no Mercado Pago.
 * Não recebe valor nem e-mail do cliente: ambos vêm do pedido e da sessão no backend.
 */
export async function createCardPayment({
  orderId,
  token,
  paymentMethodId,
  issuerId = null,
  docNumber,
  savedCardId = null,
}) {
  return callBackend('card-payment', {
    orderId,
    token,
    paymentMethodId,
    issuerId,
    docNumber,
    savedCardId,
  });
}

// ── Funções no cliente com Public Key (Checkout Transparente) ────────────────

/**
 * Tokeniza um cartão utilizando a Public Key.
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
    if (!MERCADO_PAGO_PUBLIC_KEY) {
      return { success: false, error: 'config: EXPO_PUBLIC_MERCADO_PAGO_PUBLIC_KEY ausente' };
    }

    const cleanCardNumber = (cardNumber || '').replace(/\D/g, '');
    const cleanDocNumber = (docNumber || '').replace(/\D/g, '');

    const response = await fetchWithTimeout(`https://api.mercadopago.com/v1/card_tokens?public_key=${MERCADO_PAGO_PUBLIC_KEY}`, {
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
    }, 15000);

    const data = await response.json().catch(() => ({}));
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
    if (!MERCADO_PAGO_PUBLIC_KEY) {
      return { success: false, error: 'config: EXPO_PUBLIC_MERCADO_PAGO_PUBLIC_KEY ausente' };
    }

    const response = await fetchWithTimeout(
      `https://api.mercadopago.com/v1/card_tokens?public_key=${MERCADO_PAGO_PUBLIC_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: cardId,
          security_code: securityCode,
        }),
      },
      15000
    );

    const data = await response.json().catch(() => ({}));
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
 * depois manda pro backend cobrar usando orderId (Access Token fica só no servidor).
 */
export async function chargeWithSavedCard({
  orderId,
  savedCardId,
  cardId,
  securityCode,
  paymentMethodId,
  issuerId = null,
  docNumber,
}) {
  const tokenResult = await tokenizeSavedCardCvv({ cardId, securityCode });
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error };
  }

  return createCardPayment({
    orderId,
    token: tokenResult.token,
    paymentMethodId,
    issuerId,
    docNumber,
    savedCardId,
  });
}

/**
 * Identifica a bandeira pelo BIN do cartão.
 * A verificação de Elo deve vir antes de Visa pois grande parte dos BINs Elo iniciam com 4.
 */
export function guessPaymentMethodId(cardNumber) {
  const clean = (cardNumber || '').replace(/\D/g, '');
  if (/^(4011|4312|4389|4514|4576|4573|5041|5067|5090|6277|6362|6363|650|651|655)/.test(clean)) return 'elo';
  if (/^4/.test(clean)) return 'visa';
  if (/^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[0-1]|2720)/.test(clean)) return 'master';
  if (/^(34|37)/.test(clean)) return 'amex';
  if (/^(606282|3841)/.test(clean)) return 'hipercard';
  return 'visa'; // default fallback
}
