/**
 * Cálculo de horário de funcionamento e fila de espera da loja.
 * Mantém paridade com `lib/store-status-manager.ts` do Site para que o
 * App reflita abertura/fechamento automático no relógio sem depender de
 * writes em `store_settings`.
 */

export const DEFAULT_OPEN_TIME = '10:00';
export const DEFAULT_CLOSE_TIME = '22:30';
export const DEFAULT_WAIT_MIN = 30;
export const DEFAULT_WAIT_MAX = 45;

const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * Retorna o total de minutos desde 00:00 no fuso de São Paulo (America/Sao_Paulo).
 * Faz fallback seguro para UTC-3 caso o runtime Hermes não possua dados ICU de fuso.
 */
export function getSaoPauloMinutes(date = new Date()) {
  try {
    const formatted = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);

    const [rawH, rawM] = formatted.split(':').map(Number);
    if (!Number.isNaN(rawH) && !Number.isNaN(rawM)) {
      const hours = rawH === 24 ? 0 : rawH;
      return hours * 60 + rawM;
    }
  } catch {
    // Fallback para UTC-3 (Brasília / São Paulo sem horário de verão)
  }

  return ((date.getUTCHours() - 3 + 24) % 24) * 60 + date.getUTCMinutes();
}

/**
 * Verifica se a loja deve estar aberta de acordo com a janela programada.
 * Suporta janelas no mesmo dia (ex: 10:00 às 22:00) e virada de meia-noite (ex: 18:00 às 02:00).
 */
export function shouldBeOpenBySchedule(status, date = new Date()) {
  const openTime = status?.openTime || DEFAULT_OPEN_TIME;
  const closeTime = status?.closeTime || DEFAULT_CLOSE_TIME;

  const curTotal = getSaoPauloMinutes(date);
  const [openH, openM] = String(openTime).split(':').map(Number);
  const [closeH, closeM] = String(closeTime).split(':').map(Number);

  const openTotal = (Number.isNaN(openH) ? 10 : openH) * 60 + (Number.isNaN(openM) ? 0 : openM);
  const closeTotal = (Number.isNaN(closeH) ? 22 : closeH) * 60 + (Number.isNaN(closeM) ? 0 : closeM);

  if (openTotal <= closeTotal) {
    // Janela no mesmo dia (ex: 10:00 às 22:00)
    return curTotal >= openTotal && curTotal < closeTotal;
  }
  // Janela que vira a meia-noite (ex: 18:00 às 02:00)
  return curTotal >= openTotal || curTotal < closeTotal;
}

/**
 * Avalia em memória se a loja está aberta considerando `autoSchedule`,
 * `manualOverride` e troca de ciclo (`lastCycleState`).
 */
export function evaluateStoreOpen(status, date = new Date()) {
  if (!status) return true;
  if (status.autoSchedule === false) return status.isOpen !== false;

  const scheduledOpen = shouldBeOpenBySchedule(status, date);
  if (status.manualOverride) {
    if (status.lastCycleState !== undefined && scheduledOpen !== status.lastCycleState) {
      return scheduledOpen;
    }
    return status.isOpen !== false;
  }

  return scheduledOpen;
}

/**
 * Calcula o tempo estimado de preparo considerando pedidos ativos nos últimos 10 minutos
 * (+5 min por pedido ativo sobre a base de 30–45 min).
 */
export function computeWaitTime(status, now = Date.now()) {
  const orders = Array.isArray(status?.activeOrders) ? status.activeOrders : [];
  const validOrders = orders.filter(
    (ts) => typeof ts === 'number' && !Number.isNaN(ts) && now - ts < TEN_MINUTES_MS
  );
  const additionalTime = validOrders.length * 5;

  return {
    min: DEFAULT_WAIT_MIN + additionalTime,
    max: DEFAULT_WAIT_MAX + additionalTime,
    activeOrders: validOrders,
  };
}
