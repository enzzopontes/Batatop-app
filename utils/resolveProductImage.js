const DEFAULT_SUPABASE_URL = 'https://eucwoxjmjfqylyrqunwk.supabase.co';
const DEFAULT_API_BASE_URL = 'https://batatatopiacanga.com.br';

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;

export const SUPABASE_PRODUCTS_STORAGE = `${SUPABASE_URL}/storage/v1/object/public/Products/`;

/**
 * Resolve any product image reference into a fetchable HTTPS URL:
 * - Full http(s):// URLs (Supabase Storage CDN or external) -> returned as-is
 * - Legacy /api/images/<id> -> prefixed with API_BASE_URL
 * - Relative /products/<file> or bare <file> -> mapped to Supabase Storage Products bucket
 */
export function resolveProductImage(imageUrl, fallback = null) {
  if (!imageUrl || typeof imageUrl !== 'string') return fallback;
  const trimmed = imageUrl.trim();
  if (!trimmed) return fallback;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('/api/images/')) {
    return `${API_BASE_URL}${trimmed}`;
  }

  const normalized = trimmed.replace(/^\/+products\//i, '').replace(/^\/+/, '');
  if (!normalized) return fallback;

  return `${SUPABASE_PRODUCTS_STORAGE}${normalized}`;
}
