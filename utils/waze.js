import { STORE_ADDRESS } from '../constants/store';

export const DEFAULT_STORE_CITY = STORE_ADDRESS?.city || 'Iacanga';
export const DEFAULT_STORE_STATE = STORE_ADDRESS?.uf || 'SP';

const WAZE_UL_PREFIX = 'https://waze.com/ul?';
const ALLOWED_WAZE_PARAM_KEYS = new Set(['navigate', 'll', 'q']);

const GENERIC_ADDRESS_VALUES = new Set([
  '',
  '-',
  'n/a',
  'na',
  'nao informado',
  'endereco nao informado',
  'sem endereco',
  'retirada',
  'retirada no balcao',
  'retirada no balcao da loja',
  'retirada presencial no balcao',
  'retirada na loja',
  'retirada na loja pelo cliente',
]);

const BRAZILIAN_UFS =
  'ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to';

const COMPLEMENT_SEGMENT_PATTERN =
  /^(?:ap(?:to?|artamento)?\.?|bl(?:oco)?\.?|casa|cs\.?|fundos?|portao|interfone|andar|torre|ed(?:ificio)?\.?|kitnet|sobrado|ponto\s+de\s+ref(?:erencia)?|ref(?:erencia)?\.?|obs(?:ervacao|ervacoes)?\.?|prox(?:imo)?\.?|ao\s+lado|em\s+frente|frente\s+a|atras\s+d[eo]|perto\s+d[eo]|campainha|tocar|chamar|deixar|entregar)\b/i;

const INLINE_COMPLEMENT_PATTERN =
  /(?:^|[\s,;-]+)(?:ap(?:to?|artamento)\.?|bloco|bl\.?|interfone|port[aã]o|fundos?)\b.*$/i;

const INLINE_CASA_AFTER_NUMBER_PATTERN = /(\b\d+[a-zA-Z]?)\s+(?:casa|cs\.?)\b.*$/i;

const STREET_PREFIX_PATTERN =
  /^(?:r\.?|rua|av\.?|avenida|trav\.?|travessa|al\.?|alameda|p[cç]a\.?|praca|rod\.?|rodovia|est\.?|estrada|viela|largo|jd\.?|jardim|pq\.?|parque)\b/i;

const EXPLICIT_CITY_UF_PATTERN = new RegExp(
  `(?:^|[\\s,/-])[a-z]{3,}(?:\\s+[a-z]{2,})*\\s*[/,-]\\s*(?:${BRAZILIAN_UFS})(?=$|[\\s,;-])`,
  'i'
);

const CONTROL_CHARS_PATTERN = /[\u0000-\u001F\u007F]+/g;

function normalizeForCompare(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isPickupDeliveryType(deliveryType) {
  const normalized = normalizeForCompare(deliveryType);
  return normalized === 'pickup' || normalized === 'retirada';
}

export function parseCoordinate(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function extractValidWazeCoordinates(target) {
  if (!target || typeof target !== 'object') return null;
  const lat =
    parseCoordinate(target.deliveryLat) ?? parseCoordinate(target.metadata?.delivery_lat);
  const lng =
    parseCoordinate(target.deliveryLng) ?? parseCoordinate(target.metadata?.delivery_lng);

  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;

  return { lat, lng };
}

function stripComplementLiteral(address, complement) {
  const rawComplement =
    typeof complement === 'string'
      ? complement.replace(CONTROL_CHARS_PATTERN, ' ').trim()
      : '';
  if (rawComplement.length < 2) return address;

  const escaped = escapeRegExp(rawComplement);
  const pattern = new RegExp(`(?:^|[\\s,;\\-–—(]+)${escaped}(?=$|[\\s,;\\-–—)])`, 'gi');
  return address.replace(pattern, ' ');
}

function cleanAddressSegment(segment) {
  let cleaned = segment.trim();
  if (!cleaned) return '';

  const normalized = normalizeForCompare(cleaned);
  if (COMPLEMENT_SEGMENT_PATTERN.test(normalized)) {
    return '';
  }

  if (!STREET_PREFIX_PATTERN.test(normalized)) {
    cleaned = cleaned.replace(INLINE_COMPLEMENT_PATTERN, '').trim();
  } else {
    const inlineMatch = cleaned.match(INLINE_COMPLEMENT_PATTERN);
    if (inlineMatch && inlineMatch.index !== undefined && inlineMatch.index > 0) {
      cleaned = cleaned.slice(0, inlineMatch.index).trim();
    }
  }

  cleaned = cleaned.replace(INLINE_CASA_AFTER_NUMBER_PATTERN, '$1').trim();
  cleaned = cleaned.replace(/^[,;\s\-–—]+|[,;\s\-–—]+$/g, '').trim();

  if (!cleaned || COMPLEMENT_SEGMENT_PATTERN.test(normalizeForCompare(cleaned))) {
    return '';
  }

  return cleaned;
}

function hasCityAndState(address, defaultCity, defaultState) {
  const normalized = normalizeForCompare(address);
  const hasCityUf = EXPLICIT_CITY_UF_PATTERN.test(normalized);

  const normCity = defaultCity ? normalizeForCompare(defaultCity) : '';
  const normState = defaultState ? normalizeForCompare(defaultState) : '';

  const hasDefaultCity = normCity
    ? new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normCity)}(?=$|[^a-z0-9])`, 'i').test(normalized)
    : false;

  const hasDefaultState = normState
    ? new RegExp(`(?:^|[\\s,/-])${escapeRegExp(normState)}(?=$|[\\s,;-])`, 'i').test(normalized)
    : false;

  return { hasCityUf, hasDefaultCity, hasDefaultState };
}

function resolveWazeOptions(options) {
  return {
    defaultCity: options?.defaultCity === undefined ? DEFAULT_STORE_CITY : options.defaultCity,
    defaultState: options?.defaultState === undefined ? DEFAULT_STORE_STATE : options.defaultState,
  };
}

export function formatAddressForWaze(target, options = {}) {
  if (!target || typeof target !== 'object') return null;

  const rawAddress =
    typeof target.address === 'string'
      ? target.address.replace(CONTROL_CHARS_PATTERN, ' ').trim()
      : '';

  if (!rawAddress) return null;

  const initialNormalized = normalizeForCompare(rawAddress);
  if (GENERIC_ADDRESS_VALUES.has(initialNormalized)) return null;
  if (/^(?:javascript|data|vbscript):/i.test(rawAddress.trim())) return null;

  let working = rawAddress.replace(/\([^)]*\)/g, ' ').replace(/\([^)]*$/g, ' ');
  working = stripComplementLiteral(working, target.complement);

  const rawSegments = working.split(/[,;|\n]+|\s+[-–—]\s+/);
  const cleanedSegments = [];
  const seenSegments = new Set();

  for (const segment of rawSegments) {
    const cleaned = cleanAddressSegment(segment);
    if (!cleaned) continue;
    const key = normalizeForCompare(cleaned);
    if (!key || GENERIC_ADDRESS_VALUES.has(key)) continue;
    if (seenSegments.has(key)) continue;
    seenSegments.add(key);
    cleanedSegments.push(cleaned);
  }

  let formatted = cleanedSegments.join(', ');
  formatted = formatted
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/,{2,}/g, ',')
    .replace(/^[,;\s\-–—]+|[,;\s\-–—]+$/g, '')
    .trim();

  const postCleanNormalized = normalizeForCompare(formatted);
  if (!formatted || GENERIC_ADDRESS_VALUES.has(postCleanNormalized)) return null;
  if (postCleanNormalized.replace(/[^a-z0-9]/g, '').length < 3) return null;

  const rawNeighborhood =
    typeof target.neighborhood === 'string'
      ? target.neighborhood.replace(CONTROL_CHARS_PATTERN, ' ').trim()
      : '';
  const normNeighborhood = normalizeForCompare(rawNeighborhood);
  if (
    rawNeighborhood &&
    normNeighborhood &&
    !GENERIC_ADDRESS_VALUES.has(normNeighborhood) &&
    !COMPLEMENT_SEGMENT_PATTERN.test(normNeighborhood) &&
    !postCleanNormalized.includes(normNeighborhood)
  ) {
    formatted = `${formatted}, ${rawNeighborhood}`;
  }

  const resolvedOptions = resolveWazeOptions(options);
  const defaultCity =
    typeof resolvedOptions.defaultCity === 'string' ? resolvedOptions.defaultCity.trim() : '';
  const defaultState =
    typeof resolvedOptions.defaultState === 'string' ? resolvedOptions.defaultState.trim() : '';
  const locationFlags = hasCityAndState(formatted, defaultCity, defaultState);

  if (!locationFlags.hasCityUf) {
    if (locationFlags.hasDefaultCity && defaultState && !locationFlags.hasDefaultState) {
      formatted = `${formatted} - ${defaultState}`;
    } else if (!locationFlags.hasDefaultCity && defaultCity) {
      formatted = defaultState
        ? `${formatted}, ${defaultCity} - ${defaultState}`
        : `${formatted}, ${defaultCity}`;
    }
  }

  formatted = formatted
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/,{2,}/g, ',')
    .replace(/^[,;\s]+|[,;\s]+$/g, '')
    .trim();

  if (!formatted || GENERIC_ADDRESS_VALUES.has(normalizeForCompare(formatted))) {
    return null;
  }

  return formatted;
}

export function isSafeWazeUrl(url) {
  if (typeof url !== 'string' || !url.startsWith(WAZE_UL_PREFIX)) return false;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'waze.com' ||
      parsed.pathname !== '/ul' ||
      parsed.hash !== ''
    ) {
      return false;
    }

    for (const key of parsed.searchParams.keys()) {
      if (!ALLOWED_WAZE_PARAM_KEYS.has(key)) return false;
    }

    const navigateValues = parsed.searchParams.getAll('navigate');
    if (navigateValues.length !== 1 || navigateValues[0] !== 'yes') return false;

    const llValues = parsed.searchParams.getAll('ll');
    const qValues = parsed.searchParams.getAll('q');
    const hasLl = llValues.length > 0;
    const hasQ = qValues.length > 0;

    if (hasLl === hasQ) return false;

    if (hasLl) {
      if (llValues.length !== 1) return false;
      const parts = llValues[0].split(',');
      if (parts.length !== 2) return false;
      const lat = parseCoordinate(parts[0]);
      const lng = parseCoordinate(parts[1]);
      if (lat === null || lng === null) return false;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
      if (lat === 0 && lng === 0) return false;
      return true;
    }

    return qValues.length === 1 && qValues[0].trim().length > 0;
  } catch {
    return false;
  }
}

export function buildWazeNavigationUrl(order, options = {}) {
  if (!order || typeof order !== 'object') return null;
  if (isPickupDeliveryType(order.deliveryType)) return null;

  const coords = extractValidWazeCoordinates(order);
  if (coords) {
    const url = `${WAZE_UL_PREFIX}ll=${coords.lat},${coords.lng}&navigate=yes`;
    return isSafeWazeUrl(url) ? url : null;
  }

  const resolvedOptions = resolveWazeOptions(options);
  const formattedAddress = formatAddressForWaze(order, resolvedOptions);
  if (!formattedAddress) return null;

  const url = `${WAZE_UL_PREFIX}q=${encodeURIComponent(formattedAddress)}&navigate=yes`;
  return isSafeWazeUrl(url) ? url : null;
}
