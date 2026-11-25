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
  return LUCIDE_TO_MCI[fallbackIcon] || 'silverware-fork-knife';
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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

  const raw = typeof category.icon_url === 'string' ? category.icon_url.trim() : '';
  if (!raw) return null;

  if (LOCAL_3D_ICONS[raw]) {
    return LOCAL_3D_ICONS[raw];
  }

  const decoded = safeDecodeURIComponent(raw);
  if (LOCAL_3D_ICONS[decoded]) {
    return LOCAL_3D_ICONS[decoded];
  }

  if (/^https?:\/\//i.test(raw)) {
    return { uri: raw };
  }

  if (raw.startsWith('/')) {
    const encodedPath = raw
      .split('/')
      .map((seg) => encodeURIComponent(safeDecodeURIComponent(seg)))
      .join('/');
    return { uri: `${API_BASE_URL.replace(/\/+$/, '')}${encodedPath}` };
  }

  return { uri: `${SUPABASE_URL}/storage/v1/object/public/category-icons/${encodeURIComponent(raw)}` };
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
