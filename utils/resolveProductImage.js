const DEFAULT_SUPABASE_URL = 'https://eucwoxjmjfqylyrqunwk.supabase.co';
const DEFAULT_API_BASE_URL = 'https://batatatopiacanga.com.br';

export const SUPABASE_URL = (
  process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL
).replace(/\/+$/, '');

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/+$/, '');

export const SUPABASE_PRODUCTS_STORAGE = `${SUPABASE_URL}/storage/v1/object/public/Products/`;
export const SUPABASE_COUPON_BANNERS_STORAGE = `${SUPABASE_URL}/storage/v1/object/public/coupon-banners/`;

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;
const ANY_URI_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;

function decodeAndEncodeSafeSegments(pathname, { allowLeadingSlash = false } = {}) {
  const parts = pathname.split('/');
  const encodedParts = [];

  for (let i = 0; i < parts.length; i += 1) {
    const rawSeg = parts[i];
    if (rawSeg === '') {
      if (i === 0 && allowLeadingSlash) {
        encodedParts.push('');
        continue;
      }
      return null;
    }

    let decoded;
    try {
      decoded = decodeURIComponent(rawSeg);
    } catch {
      return null;
    }

    // Bloqueia dupla codificação de traversal/separadores
    let twiceDecoded = decoded;
    try {
      twiceDecoded = decodeURIComponent(decoded);
    } catch {
      // ignora se houver '%' literal após primeira decodificação
    }

    if (
      !decoded ||
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('..') ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      twiceDecoded === '.' ||
      twiceDecoded === '..' ||
      twiceDecoded.includes('..') ||
      twiceDecoded.includes('/') ||
      twiceDecoded.includes('\\')
    ) {
      return null;
    }

    encodedParts.push(encodeURIComponent(decoded));
  }

  return encodedParts.join('/');
}

function splitPathSuffix(rawPath) {
  const match = rawPath.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
  return {
    pathname: match ? match[1] : rawPath,
    search: match && match[2] ? match[2] : '',
    hash: match && match[3] ? match[3] : '',
  };
}

function normalizeRemoteHttpsUrl(raw) {
  try {
    const upgraded = raw.replace(/^http:\/\//i, 'https://');
    const url = new URL(upgraded);
    if (url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Resolve any product image reference into a fetchable HTTPS URL:
 * - Full http(s):// URLs (Supabase Storage CDN or external) -> upgraded to https
 * - Legacy /api/images/<id> -> prefixed with normalized API_BASE_URL
 * - Relative /products/<file>, products/<file>, or bare <file> -> mapped to Supabase Storage Products bucket
 */
export function resolveProductImage(imageUrl, fallback = null) {
  if (!imageUrl || typeof imageUrl !== 'string') return fallback;
  if (CONTROL_CHARS_RE.test(imageUrl)) return fallback;
  const trimmed = imageUrl.trim();
  if (!trimmed || trimmed.includes('\\') || trimmed.startsWith('//')) return fallback;

  if (/^https?:\/\//i.test(trimmed)) {
    return normalizeRemoteHttpsUrl(trimmed) || fallback;
  }

  // Bloqueia qualquer outro scheme (javascript:, data:, file:, vbscript:, etc.)
  if (ANY_URI_SCHEME_RE.test(trimmed)) {
    return fallback;
  }

  if (trimmed.startsWith('/api/images/')) {
    const { pathname, search, hash } = splitPathSuffix(trimmed);
    const safePath = decodeAndEncodeSafeSegments(pathname, { allowLeadingSlash: true });
    if (!safePath) return fallback;
    return `${API_BASE_URL}${safePath}${search}${hash}`;
  }

  const { pathname, search, hash } = splitPathSuffix(trimmed);
  const normalized = pathname.replace(/^\/?(?:products\/)+/i, '').replace(/^\/+/, '');
  if (!normalized) return fallback;

  const safePath = decodeAndEncodeSafeSegments(normalized);
  if (!safePath) return fallback;

  return `${SUPABASE_PRODUCTS_STORAGE}${safePath}${search}${hash}`;
}

/**
 * Resolve home banner image references into an expo-image compatible URI:
 * - Allows https:// (upgrades http:// to https://), raster data:image/ (png/jpeg/webp/gif),
 *   relative / paths via API_BASE_URL, and safe relative storage paths under coupon-banners.
 */
export function resolveBannerImageUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  if (CONTROL_CHARS_RE.test(rawUrl)) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.includes('\\') || trimmed.startsWith('//')) return null;

  if (SAFE_DATA_IMAGE_RE.test(trimmed)) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return normalizeRemoteHttpsUrl(trimmed);
  }

  if (ANY_URI_SCHEME_RE.test(trimmed)) {
    return null;
  }

  if (trimmed.startsWith('/')) {
    const { pathname, search, hash } = splitPathSuffix(trimmed);
    const safePath = decodeAndEncodeSafeSegments(pathname, { allowLeadingSlash: true });
    if (!safePath) return null;
    return `${API_BASE_URL}${safePath}${search}${hash}`;
  }

  const { pathname, search, hash } = splitPathSuffix(trimmed);
  const cleanPath = pathname.replace(/^\/+/, '');
  if (!cleanPath) return null;

  const safePath = decodeAndEncodeSafeSegments(cleanPath);
  if (!safePath) return null;

  return `${SUPABASE_COUPON_BANNERS_STORAGE}${safePath}${search}${hash}`;
}
