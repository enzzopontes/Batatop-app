import { API_BASE_URL, SUPABASE_URL } from './resolveProductImage';

// Local bundled 3D icons for instant zero-network display
const LOCAL_3D_ICONS = {
  '/assets/icones3d/icone cardapio.png': require('../assets/icones3d/icone cardapio.png'),
  '/assets/icones3d/icone batata.png': require('../assets/icones3d/icone batata.png'),
  '/assets/icones3d/icone macarrao.png': require('../assets/icones3d/icone macarrao.png'),
  '/assets/icones3d/icone bebidas geladas.png': require('../assets/icones3d/icone bebidas geladas.png'),
  '/assets/icones3d/icone cupom.png': require('../assets/icones3d/icone cupom.png'),
  '/assets/icones3d/iconetodos.png': require('../assets/icones3d/iconetodos.png'),
};

const LOCAL_3D_BY_SLUG = {
  cardapio: LOCAL_3D_ICONS['/assets/icones3d/icone cardapio.png'],
  batata: LOCAL_3D_ICONS['/assets/icones3d/icone batata.png'],
  macarrao: LOCAL_3D_ICONS['/assets/icones3d/icone macarrao.png'],
  bebida: LOCAL_3D_ICONS['/assets/icones3d/icone bebidas geladas.png'],
  cupom: LOCAL_3D_ICONS['/assets/icones3d/icone cupom.png'],
  cupons: LOCAL_3D_ICONS['/assets/icones3d/icone cupom.png'],
  todos: LOCAL_3D_ICONS['/assets/icones3d/iconetodos.png'],
  todas: LOCAL_3D_ICONS['/assets/icones3d/iconetodos.png'],
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export function resolveLocalPreset3DIcon(slug) {
  const norm = normalizeCategorySlug(slug);
  return hasOwn(LOCAL_3D_BY_SLUG, norm) ? LOCAL_3D_BY_SLUG[norm] : null;
}

// Map Lucide fallback icon names (saved by web Admin) to MaterialCommunityIcons names
const LUCIDE_TO_MCI = {
  UtensilsCrossed: 'silverware-fork-knife',
  Flame: 'fire',
  Utensils: 'pasta',
  CupSoda: 'cup',
  BookOpen: 'book-open-variant',
  Ticket: 'ticket-percent',
  LayoutGrid: 'view-grid',
  Pizza: 'pizza',
  Sandwich: 'hamburger',
  IceCreamCone: 'ice-cream',
  Coffee: 'coffee',
  Soup: 'bowl-mix',
  Beef: 'food-steak',
  Salad: 'leaf',
  Cookie: 'cookie',
  Sparkles: 'star-four-points',
  Tag: 'tag',
  ShoppingBag: 'shopping',
  Star: 'star',
  ChefHat: 'chef-hat',
  Percent: 'percent',
  Gift: 'gift',
};

export function mapFallbackIconToMci(fallbackIcon) {
  if (!fallbackIcon || typeof fallbackIcon !== 'string') {
    return 'silverware-fork-knife';
  }
  return hasOwn(LUCIDE_TO_MCI, fallbackIcon) ? LUCIDE_TO_MCI[fallbackIcon] : 'silverware-fork-knife';
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;
const PERCENT_CONTROL_CHARS_RE = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i;
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const SAFE_STORAGE_SEGMENT_RE = /^[a-zA-Z0-9._\-\s()]+$/;

function isPrivateOrLocalHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') return true;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost')) {
    return true;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }

  if (host.includes(':')) {
    if (host === '::' || host === '::1' || host === '0:0:0:0:0:0:0:1' || host === '0:0:0:0:0:0:0:0') {
      return true;
    }
    if (/^(?:fc|fd)[0-9a-f]{0,2}:/.test(host)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
    if (host.startsWith('::ffff:')) {
      const mapped = host.slice(7);
      if (mapped.includes('.')) return isPrivateOrLocalHostname(mapped);
      const hexParts = mapped.split(':');
      if (hexParts.length === 2) {
        const hi = parseInt(hexParts[0], 16);
        const lo = parseInt(hexParts[1], 16);
        if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
          const ipv4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
          return isPrivateOrLocalHostname(ipv4);
        }
      }
    }
  }

  return false;
}

export function isSafeIconUrl(raw) {
  if (typeof raw !== 'string') return false;
  if (CONTROL_CHARS_RE.test(raw)) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (PERCENT_CONTROL_CHARS_RE.test(trimmed)) return false;
  if (trimmed.includes('\\')) return false;
  if (trimmed.includes('..')) return false;
  const dec1 = safeDecodeURIComponent(trimmed);
  if (CONTROL_CHARS_RE.test(dec1) || PERCENT_CONTROL_CHARS_RE.test(dec1) || dec1.includes('\\') || dec1.includes('..')) {
    return false;
  }
  const dec2 = safeDecodeURIComponent(dec1);
  if (CONTROL_CHARS_RE.test(dec2) || PERCENT_CONTROL_CHARS_RE.test(dec2) || dec2.includes('\\') || dec2.includes('..')) {
    return false;
  }
  if (trimmed.startsWith('//') || dec1.startsWith('//') || dec2.startsWith('//')) return false;
  if (
    (SCHEME_RE.test(trimmed) && !/^https:\/\//i.test(trimmed)) ||
    (SCHEME_RE.test(dec1) && !/^https:\/\//i.test(dec1)) ||
    (SCHEME_RE.test(dec2) && !/^https:\/\//i.test(dec2))
  ) {
    return false;
  }
  if (/^https:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
      if (isPrivateOrLocalHostname(parsed.hostname)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Resolves a category's icon into an expo-image compatible source:
 * - Returns null when icon_type === 'lucide' or no icon_url
 * - Returns local require() asset when matching bundled 3D icon
 * - Returns { uri } for full http(s) URLs (Supabase Storage category-icons)
 * - Resolves relative web paths (/assets/...) against API_BASE_URL
 */
export function resolveCategoryIconSource(category) {
  if (!category || category.icon_type === 'lucide') return null;

  if (!isSafeIconUrl(category.icon_url)) return resolveLocalPreset3DIcon(category.slug);
  const trimmed = category.icon_url.trim();

  if (hasOwn(LOCAL_3D_ICONS, trimmed)) {
    return LOCAL_3D_ICONS[trimmed];
  }

  const decoded = safeDecodeURIComponent(trimmed);
  if (hasOwn(LOCAL_3D_ICONS, decoded)) {
    return LOCAL_3D_ICONS[decoded];
  }

  if (/^https:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'https:' || url.username || url.password || isPrivateOrLocalHostname(url.hostname)) {
        return resolveLocalPreset3DIcon(category.slug);
      }
      return { uri: url.toString() };
    } catch {
      return resolveLocalPreset3DIcon(category.slug);
    }
  }

  if (trimmed.startsWith('/')) {
    const match = trimmed.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
    const pathname = match ? match[1] : trimmed;
    const search = match && match[2] ? match[2] : '';
    const hash = match && match[3] ? match[3] : '';
    const rawParts = pathname.split('/');
    const encodedParts = [];
    for (let i = 0; i < rawParts.length; i += 1) {
      const seg = rawParts[i];
      if (seg === '' && i === 0) {
        encodedParts.push('');
        continue;
      }
      if (!seg) return resolveLocalPreset3DIcon(category.slug);
      const dec = safeDecodeURIComponent(seg);
      const dec2 = safeDecodeURIComponent(dec);
      if (
        CONTROL_CHARS_RE.test(dec) ||
        CONTROL_CHARS_RE.test(dec2) ||
        dec === '.' ||
        dec === '..' ||
        dec.includes('..') ||
        dec.includes('/') ||
        dec.includes('\\') ||
        dec2 === '.' ||
        dec2 === '..' ||
        dec2.includes('..') ||
        dec2.includes('/') ||
        dec2.includes('\\')
      ) {
        return resolveLocalPreset3DIcon(category.slug);
      }
      encodedParts.push(encodeURIComponent(dec));
    }
    return { uri: `${API_BASE_URL.replace(/\/+$/, '')}${encodedParts.join('/')}${search}${hash}` };
  }

  const segments = trimmed.replace(/^\/+/, '').split('/');
  const encodedStorageSegments = [];
  for (const seg of segments) {
    if (!seg) return resolveLocalPreset3DIcon(category.slug);
    const dec = safeDecodeURIComponent(seg);
    const dec2 = safeDecodeURIComponent(dec);
    if (
      !dec ||
      dec === '.' ||
      dec === '..' ||
      dec.includes('..') ||
      dec.includes('/') ||
      dec.includes('\\') ||
      dec2 === '.' ||
      dec2 === '..' ||
      dec2.includes('..') ||
      !SAFE_STORAGE_SEGMENT_RE.test(dec)
    ) {
      return resolveLocalPreset3DIcon(category.slug);
    }
    encodedStorageSegments.push(encodeURIComponent(dec));
  }
  if (encodedStorageSegments.length === 0) {
    return resolveLocalPreset3DIcon(category.slug);
  }

  return { uri: `${SUPABASE_URL}/storage/v1/object/public/category-icons/${encodedStorageSegments.join('/')}` };
}

export function normalizeCategorySlug(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const clean = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (clean === 'batatas') return 'batata';
  if (clean === 'bebidas') return 'bebida';
  if (clean === 'macarroes' || clean === 'massas') return 'macarrao';
  return clean;
}
