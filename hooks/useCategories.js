import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../supabaseConfig';
import { normalizeCategorySlug } from '../utils/resolveCategoryIcon';

export const DEFAULT_CATEGORIES = [
  {
    id: 'default-cardapio',
    slug: 'cardapio',
    name: 'Cardápio',
    description: 'Veja todas as opções do nosso cardápio',
    kind: 'home_shortcut',
    icon_url: '/assets/icones3d/icone cardapio.png',
    icon_type: 'preset_3d',
    fallback_icon: 'BookOpen',
    accent_color: '#E3A008',
    badge_text: null,
    badge_color: '#C1440E',
    custom_href: '/cardapio',
    is_active: true,
    show_on_home_bar: true,
    home_bar_order: 0,
    show_on_home_featured: false,
    home_featured_order: 10,
    home_featured_limit: 6,
    show_on_menu: false,
    menu_order: 10,
    menu_layout_zone: 'main',
    allows_addons: false,
    allows_notes: false,
    show_ranking: false,
  },
  {
    id: 'default-batata',
    slug: 'batata',
    name: 'Batatas',
    description: 'Batatas recheadas generosas preparadas na hora',
    kind: 'product_category',
    icon_url: '/assets/icones3d/icone batata.png',
    icon_type: 'preset_3d',
    fallback_icon: 'Flame',
    accent_color: '#E3A008',
    badge_text: null,
    badge_color: '#C1440E',
    custom_href: null,
    is_active: true,
    show_on_home_bar: true,
    home_bar_order: 1,
    show_on_home_featured: true,
    home_featured_order: 0,
    home_featured_limit: 6,
    show_on_menu: true,
    menu_order: 0,
    menu_layout_zone: 'main',
    allows_addons: true,
    allows_notes: true,
    show_ranking: true,
  },
  {
    id: 'default-macarrao',
    slug: 'macarrao',
    name: 'Macarrão',
    description: 'Massas artesanais com molhos cremosos e tempero especial',
    kind: 'product_category',
    icon_url: '/assets/icones3d/icone macarrao.png',
    icon_type: 'preset_3d',
    fallback_icon: 'Utensils',
    accent_color: '#C1440E',
    badge_text: null,
    badge_color: '#C1440E',
    custom_href: null,
    is_active: true,
    show_on_home_bar: true,
    home_bar_order: 2,
    show_on_home_featured: true,
    home_featured_order: 1,
    home_featured_limit: 6,
    show_on_menu: true,
    menu_order: 1,
    menu_layout_zone: 'main',
    allows_addons: true,
    allows_notes: true,
    show_ranking: true,
  },
  {
    id: 'default-bebida',
    slug: 'bebida',
    name: 'Bebidas',
    description: 'Bebidas bem geladas para acompanhar seu pedido',
    kind: 'product_category',
    icon_url: '/assets/icones3d/icone bebidas geladas.png',
    icon_type: 'preset_3d',
    fallback_icon: 'CupSoda',
    accent_color: '#0284C7',
    badge_text: null,
    badge_color: '#C1440E',
    custom_href: null,
    is_active: true,
    show_on_home_bar: true,
    home_bar_order: 3,
    show_on_home_featured: false,
    home_featured_order: 2,
    home_featured_limit: 6,
    show_on_menu: true,
    menu_order: 2,
    menu_layout_zone: 'sidebar_right',
    allows_addons: false,
    allows_notes: false,
    show_ranking: false,
  },
  {
    id: 'default-cupons',
    slug: 'cupons',
    name: 'Cupons',
    description: 'Descontos exclusivos para o seu pedido',
    kind: 'home_shortcut',
    icon_url: '/assets/icones3d/icone cupom.png',
    icon_type: 'preset_3d',
    fallback_icon: 'Ticket',
    accent_color: '#C1440E',
    badge_text: null,
    badge_color: '#C1440E',
    custom_href: '/cupons',
    is_active: true,
    show_on_home_bar: true,
    home_bar_order: 4,
    show_on_home_featured: false,
    home_featured_order: 11,
    home_featured_limit: 6,
    show_on_menu: false,
    menu_order: 11,
    menu_layout_zone: 'main',
    allows_addons: false,
    allows_notes: false,
    show_ranking: false,
  },
  {
    id: 'default-todos',
    slug: 'todos',
    name: 'Ver mais',
    description: 'Explorar o cardápio completo',
    kind: 'home_shortcut',
    icon_url: '/assets/icones3d/iconetodos.png',
    icon_type: 'preset_3d',
    fallback_icon: 'LayoutGrid',
    accent_color: '#E3A008',
    badge_text: null,
    badge_color: '#C1440E',
    custom_href: '/cardapio',
    is_active: true,
    show_on_home_bar: true,
    home_bar_order: 5,
    show_on_home_featured: false,
    home_featured_order: 12,
    home_featured_limit: 6,
    show_on_menu: false,
    menu_order: 12,
    menu_layout_zone: 'main',
    allows_addons: false,
    allows_notes: false,
    show_ranking: false,
  },
];

export function mapCategoryRow(row) {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: row.description ?? null,
    kind: row.kind === 'home_shortcut' ? 'home_shortcut' : 'product_category',
    icon_url: row.icon_url ?? null,
    icon_type: row.icon_type === 'upload' || row.icon_type === 'lucide' ? row.icon_type : 'preset_3d',
    fallback_icon: row.fallback_icon || 'UtensilsCrossed',
    accent_color: row.accent_color || '#E3A008',
    badge_text: row.badge_text ?? null,
    badge_color: row.badge_color || '#C1440E',
    custom_href: row.custom_href ?? null,
    is_active: row.is_active !== false,
    show_on_home_bar: row.show_on_home_bar !== false,
    home_bar_order: Number.isFinite(Number(row.home_bar_order)) ? Number(row.home_bar_order) : 0,
    show_on_home_featured: Boolean(row.show_on_home_featured),
    home_featured_order: Number.isFinite(Number(row.home_featured_order)) ? Number(row.home_featured_order) : 0,
    home_featured_limit: Math.min(24, Math.max(1, Number(row.home_featured_limit) || 6)),
    show_on_menu: row.show_on_menu !== false,
    menu_order: Number.isFinite(Number(row.menu_order)) ? Number(row.menu_order) : 0,
    menu_layout_zone: row.menu_layout_zone === 'sidebar_right' ? 'sidebar_right' : 'main',
    allows_addons: row.allows_addons !== false,
    allows_notes: row.allows_notes !== false,
    show_ranking: row.show_ranking !== false,
  };
}

export function matchProductToCategory(product, category) {
  if (!product || !category) return false;
  const prodCatId = product.category_id ?? product.categoryId;
  if (prodCatId && prodCatId === category.id) return true;
  const prodSlug = normalizeCategorySlug(product.category || product.categoria);
  return prodSlug !== '' && prodSlug === normalizeCategorySlug(category.slug);
}

export function countActiveProductsByCategory(products = []) {
  const countsById = {};
  const countsBySlug = {};
  for (const p of products) {
    const isAvailable = p.disponivel !== false && p.available !== false;
    if (!isAvailable) continue;
    const catId = p.category_id ?? p.categoryId;
    if (catId) {
      countsById[catId] = (countsById[catId] || 0) + 1;
    }
    const slug = normalizeCategorySlug(p.category || p.categoria);
    if (slug) {
      countsBySlug[slug] = (countsBySlug[slug] || 0) + 1;
    }
  }
  return { countsById, countsBySlug };
}

export function getActiveCountForCategory(category, countMaps) {
  if (!category || !countMaps) return 0;
  if (countMaps.countsById[category.id]) return countMaps.countsById[category.id];
  return countMaps.countsBySlug[normalizeCategorySlug(category.slug)] || 0;
}

export async function fetchActiveCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('home_bar_order', { ascending: true })
    .order('name', { ascending: true });

  if (error || !data || data.length === 0) {
    return { categories: DEFAULT_CATEGORIES, error: error || null, isFallback: true };
  }

  return { categories: data.map(mapCategoryRow), error: null, isFallback: false };
}

export async function fetchCategoryRuleForProduct(product) {
  try {
    const catId = product?.category_id ?? product?.categoryId;
    const slug = normalizeCategorySlug(product?.category || product?.categoria);

    if (catId) {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('id', catId)
        .maybeSingle();
      if (!error && data) return mapCategoryRow(data);
    }

    if (slug) {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (!error && data) return mapCategoryRow(data);
    }
  } catch {
    // Graceful fallback below
  }

  const slug = normalizeCategorySlug(product?.category || product?.categoria);
  const fallback = DEFAULT_CATEGORIES.find((c) => c.slug === slug);
  if (fallback) return fallback;

  return {
    slug: slug || 'outros',
    allows_addons: !slug.startsWith('bebida'),
    allows_notes: !slug.startsWith('bebida'),
    show_ranking: !slug.startsWith('bebida'),
  };
}

export function useCategories({ subscribeRealtime = true, refetchOnFocus = true } = {}) {
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFallback, setIsFallback] = useState(true);
  const mountedRef = useRef(true);

  const loadCategories = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetchActiveCategories();
      if (!mountedRef.current) return;
      setCategories(res.categories);
      setIsFallback(res.isFallback);
      setError(res.error ? res.error.message || 'Erro ao carregar categorias' : null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err?.message || 'Sem conexão ao carregar categorias');
      setIsFallback(true);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadCategories();
    return () => {
      mountedRef.current = false;
    };
  }, [loadCategories]);

  // Refetch silently whenever the screen regains focus
  useFocusEffect(
    useCallback(() => {
      if (refetchOnFocus) {
        loadCategories({ silent: true });
      }
    }, [refetchOnFocus, loadCategories])
  );

  // Supabase Realtime subscription for instant updates from Admin
  useEffect(() => {
    if (!subscribeRealtime) return;
    const channelName = `categories_realtime_${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        () => {
          loadCategories({ silent: true });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [subscribeRealtime, loadCategories]);

  const productCategories = useMemo(
    () =>
      categories
        .filter((c) => c.is_active && c.kind === 'product_category')
        .sort((a, b) => a.menu_order - b.menu_order || a.name.localeCompare(b.name)),
    [categories]
  );

  const getHomeBarItems = useCallback(
    (products = []) => {
      const hasProductsLoaded = Array.isArray(products) && products.length > 0;
      const counts = hasProductsLoaded ? countActiveProductsByCategory(products) : null;
      return categories
        .filter((c) => {
          if (!c.is_active || !c.show_on_home_bar) return false;
          if (c.kind === 'product_category' && counts) {
            return getActiveCountForCategory(c, counts) > 0;
          }
          return true;
        })
        .sort((a, b) => a.home_bar_order - b.home_bar_order || a.name.localeCompare(b.name));
    },
    [categories]
  );

  const getHomeFeaturedCategories = useCallback(
    (products = []) => {
      const counts = countActiveProductsByCategory(products);
      return categories
        .filter((c) => {
          if (!c.is_active || c.kind !== 'product_category' || !c.show_on_home_featured) {
            return false;
          }
          return getActiveCountForCategory(c, counts) > 0;
        })
        .sort((a, b) => a.home_featured_order - b.home_featured_order || a.name.localeCompare(b.name));
    },
    [categories]
  );

  const getMenuCategories = useCallback(
    (products = []) => {
      const counts = countActiveProductsByCategory(products);
      return categories
        .filter((c) => {
          if (!c.is_active || c.kind !== 'product_category' || !c.show_on_menu) {
            return false;
          }
          return getActiveCountForCategory(c, counts) > 0;
        })
        .sort((a, b) => a.menu_order - b.menu_order || a.name.localeCompare(b.name));
    },
    [categories]
  );

  const refresh = useCallback(() => loadCategories({ silent: false }), [loadCategories]);
  const silentRefresh = useCallback(() => loadCategories({ silent: true }), [loadCategories]);

  return {
    categories,
    productCategories,
    loading,
    error,
    isFallback,
    refresh,
    silentRefresh,
    getHomeBarItems,
    getHomeFeaturedCategories,
    getMenuCategories,
  };
}
