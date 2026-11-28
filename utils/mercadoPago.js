import { getEffectiveSession } from './authSession';

const MERCADO_PAGO_PUBLIC_KEY = process.env.EXPO_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://batatatopiacanga.com.br';

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callBackend(path, body, method = 'POST', timeoutMs = 18000) {
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
        httpStatus: response.status,
        code: data.code || data.error_code || (typeof data.error === 'string' ? data.error : null),
        status: data?.status,
        statusDetail: data.statusDetail || data.status_detail,
        action: data?.action,
        needs_review: data?.needs_review,
        review_reason: data?.review_reason,
        error: data.error || (response.status === 500 ? 'Erro de configuração no servidor' : 'Erro no processamento'),
        details: data.details,
      };
    }

    return data;
  } catch (err) {
    console.error(`[mercadoPago] Erro de conexão em "${path}":`, err);
    return { success: false, error: 'Erro de conexão com o servidor. Verifique sua internet e tente novamente.' };
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
    console.error('[mercadoPago] Erro ao consultar status do Pix:', err);
    return { success: false, error: 'Erro de conexão com o servidor. Tente novamente.' };
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
  installments = 1,
  installmentsBaseAmount = null,
}) {
  return callBackend('card-payment', {
    orderId,
    token,
    paymentMethodId,
    issuerId,
    docNumber,
    savedCardId,
    installments,
    installmentsBaseAmount,
  });
}

/**
 * Opções reais de parcelamento no crédito (Mercado Pago), consultadas no backend.
 * Cartão salvo: envia só savedCardId (BIN/emissor resolvidos no servidor). Cartão digitado: envia o BIN.
 */
export async function getInstallments({ amount, savedCardId = null, bin = null }) {
  return callBackend('installments', { amount, savedCardId, bin });
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
  docNumber,
}) {
  try {
    if (!MERCADO_PAGO_PUBLIC_KEY) {
      console.error('[mercadoPago] Missing EXPO_PUBLIC_MERCADO_PAGO_PUBLIC_KEY');
      return { success: false, error: 'Pagamento com cartão indisponível no momento. Tente novamente ou use Pix.' };
    }

    const cleanCardNumber = (cardNumber || '').replace(/\D/g, '');
    const cleanDoc = (docNumber || '').replace(/\D/g, '');

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
            type: cleanDoc.length === 14 ? 'CNPJ' : 'CPF',
            number: cleanDoc,
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
      console.error('[mercadoPago] Erro ao tokenizar cartão:', {
        status: response.status,
        message: data.message,
        cause: data.cause,
      });
      return { success: false, error: 'Não foi possível validar os dados do cartão. Verifique as informações e tente novamente.' };
    }
  } catch (err) {
    console.error('[mercadoPago] Erro de conexão ao tokenizar cartão:', err);
    return { success: false, error: 'Erro de conexão com o serviço de pagamento. Tente novamente.' };
  }
}

/**
 * Tokeniza o CVV de um cartão já salvo (card_id + security_code), usando a Public Key.
 */
export async function tokenizeSavedCardCvv({ cardId, securityCode }) {
  try {
    if (!MERCADO_PAGO_PUBLIC_KEY) {
      console.error('[mercadoPago] Missing EXPO_PUBLIC_MERCADO_PAGO_PUBLIC_KEY');
      return { success: false, error: 'Pagamento com cartão indisponível no momento. Tente novamente ou use Pix.' };
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
    console.error('[mercadoPago] Erro ao validar CVV do cartão salvo:', {
      status: response.status,
      message: data.message,
      cause: data.cause,
    });
    return {
      success: false,
      error: 'Não foi possível validar o código de segurança do cartão. Confira o CVV e tente novamente.',
    };
  } catch (err) {
    console.error('[mercadoPago] Erro de conexão ao validar CVV do cartão salvo:', err);
    return { success: false, error: 'Erro de conexão com o serviço de pagamento. Tente novamente.' };
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
  installments = 1,
  installmentsBaseAmount = null,
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
    installments,
    installmentsBaseAmount,
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
