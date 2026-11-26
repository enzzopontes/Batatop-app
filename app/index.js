import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  Pressable,
  ActivityIndicator,
  Image,
  FlatList,
  ToastAndroid,
  Platform,
  Dimensions,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeGetNotificationPermissions } from '../utils/pushNotifications';
import { signalAppReady } from '../utils/appReady';
import { ALREADY_SEEN_WELCOME_KEY } from './welcome';
import { ALREADY_SEEN_LOCATION_KEY } from './location';
import * as Location from 'expo-location';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { useProductRanking } from '../hooks/useProductRanking';
import {
  useCategories,
  matchProductToCategory,
  DEFAULT_HOME_GRID_LAYOUT,
} from '../hooks/useCategories';
import { normalizeCategorySlug, mapFallbackIconToMci } from '../utils/resolveCategoryIcon';
import BannerCarousel from '../components/BannerCarousel';
import { ScrollReveal, useRevealScope } from '../components/ui/ScrollReveal';
import CategoriasFlutuantes from '../components/CategoriasFlutuantes';
import CategoryIcon from '../components/CategoryIcon';
import RestaurantHeaderCard from '../components/RestaurantHeaderCard';
import { handleCategoriaPress } from '../constants/categorias';
import { fetchHomeCoupons } from '../utils/homeCoupons';
import HomeCouponCard, { HOME_COUPON_CARD_WIDTH, HOME_COUPON_GAP } from '../components/HomeCouponCard';
import { HomeDestaquesSkeleton, HomeGridSkeleton } from '../components/Skeleton';
import {
  useScrollHandler,
  useHeaderHeight,
  useHeaderHidden,
  HEADER_HYSTERESIS,
  HEADER_ANIM_DURATION,
  HEADER_EASING,
} from './_layout';

// ─── Cupons (dimensões e compatibilidade de bundle Metro) ────────────────────
const CUPOM_GAP = HOME_COUPON_GAP;
const CUPOM_CARD_WIDTH = HOME_COUPON_CARD_WIDTH;

// ─── Grid "Batatas mais pedidas" (2 colunas, largura fixa calculada) ──────────
const PROD_GRID_GAP = 14;
const PROD_CARD_WIDTH = (Dimensions.get('window').width - SPACING[6] * 2 - PROD_GRID_GAP) / 2;
const PROD_IMG_HEIGHT = PROD_CARD_WIDTH * 0.9;

// ─── Pressable com scale ───────────────────────────────────────────────────────
function PressableScale({ children, onPress, style }) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () =>
    Animated.timing(scale, { toValue: 0.97, duration: 100, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.timing(scale, { toValue: 1, duration: 180, useNativeDriver: true }).start();

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} style={style}>
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}

// ─── Fallbacks de imagem por categoria (fixos — não recriar a cada render) ────
const PROD_IMG_FALLBACKS = {
  batata: 'https://images.unsplash.com/photo-1518013391915-e40643a1bce1?w=600',
  batatas: 'https://images.unsplash.com/photo-1518013391915-e40643a1bce1?w=600',
  bebida: 'https://images.unsplash.com/photo-1544145945-f904253d0c7b?w=600',
  bebidas: 'https://images.unsplash.com/photo-1544145945-f904253d0c7b?w=600',
  macarrao: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600',
};
const MINI_IMG_FALLBACKS = {
  batata: 'https://images.unsplash.com/photo-1518013391915-e40643a1bce1?w=400',
  batatas: 'https://images.unsplash.com/photo-1518013391915-e40643a1bce1?w=400',
  bebida: 'https://images.unsplash.com/photo-1544145945-f904253d0c7b?w=400',
  bebidas: 'https://images.unsplash.com/photo-1544145945-f904253d0c7b?w=400',
  macarrao: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=400',
};

// ─── Card de Produto (Batatas mais pedidas) ───────────────────────────────────
const ProdutoCard = memo(function ProdutoCard({ produto }) {
  const router = useRouter();
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    setUseFallback(false);
  }, [produto?.imagem]);

  const fallbackKey = normalizeCategorySlug(produto.categoria);
  const imageSource =
    useFallback || !produto.imagem
      ? { uri: PROD_IMG_FALLBACKS[fallbackKey] || PROD_IMG_FALLBACKS.batatas }
      : { uri: produto.imagem };

  return (
    <PressableScale onPress={() => router.push(`/produto/${produto.id}`)}>
      <View style={s.prodCard}>
        {/* Imagem */}
        <View style={s.prodImgWrapper}>
          <ExpoImage
            source={imageSource}
            style={s.prodImg}
            cachePolicy="memory-disk"
            onError={() => setUseFallback(true)}
          />
          <View style={s.prodOverlay} />
        </View>

        {/* Info */}
        <View style={s.prodInfo}>
          <View style={s.prodTitleGroup}>
            <Text style={s.prodNome} numberOfLines={2}>{produto.nome}</Text>
            <Text style={s.prodDesc} numberOfLines={2}>{produto.descricao}</Text>
          </View>
          <View style={s.prodTags}>
            <View style={s.prodTag}>
              <Ionicons name="time-outline" size={10} color={COLORS.textMuted} />
              <Text style={s.prodTagText}>{produto.tempo} min</Text>
            </View>
            <View style={s.prodTag}>
              <Ionicons name="star" size={10} color={COLORS.primary} />
              <Text style={s.prodTagText}>{produto.avaliacoes || '4.8'}</Text>
            </View>
          </View>
          <View style={s.prodFooter}>
            <Text style={s.prodPreco} numberOfLines={1}>{produto.precoFormatado}</Text>
            <View style={s.addBtn}>
              <Ionicons name="add" size={16} color={COLORS.background} />
            </View>
          </View>
        </View>
      </View>
    </PressableScale>
  );
});

// ─── Card Horizontal (Destaques) ──────────────────────────────────────────────
const DestaqueMiniCard = memo(function DestaqueMiniCard({ produto }) {
  const router = useRouter();
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    setUseFallback(false);
  }, [produto?.imagem]);

  const fallbackKey = normalizeCategorySlug(produto.categoria);
  const imageSource =
    useFallback || !produto.imagem
      ? { uri: MINI_IMG_FALLBACKS[fallbackKey] || MINI_IMG_FALLBACKS.batatas }
      : { uri: produto.imagem };

  return (
    <PressableScale onPress={() => router.push(`/produto/${produto.id}`)}>
      <View style={s.miniCard}>
        <View style={s.miniImgWrapper}>
          <ExpoImage
            source={imageSource}
            style={s.miniImg}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setUseFallback(true)}
          />
        </View>
        <View style={s.miniBody}>
          <Text style={s.miniNome} numberOfLines={2}>{produto.nome}</Text>

          <View style={s.miniTags}>
            <View style={s.miniTag}>
              <Ionicons name="star" size={9} color={COLORS.primary} />
              <Text style={s.miniTagText}>{produto.avaliacoes || '4.5'}</Text>
            </View>
            <View style={s.miniTag}>
              <Ionicons name="time-outline" size={9} color={COLORS.textMuted} />
              <Text style={s.miniTagText}>{produto.tempo} min</Text>
            </View>
          </View>

          <View style={s.miniFooter}>
            <Text style={s.miniPreco}>{produto.precoFormatado}</Text>
            <Pressable style={s.miniBtnAdd} onPress={() => router.push(`/produto/${produto.id}`)}>
              <Ionicons name="add" size={20} color={COLORS.background} />
            </Pressable>
          </View>
        </View>
      </View>
    </PressableScale>
  );
});


// ─── Tela Principal ────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const { produtos, loading, error: productsError, refetch: refetchRanking } = useProductRanking();
  const { width: windowWidth } = useWindowDimensions();
  const {
    categories,
    homeGridLayout: rawHomeGridLayout,
    getHomeBarItems,
    getHomeFeaturedCategories,
    refresh: refreshCategories,
    loading: categoriesLoading,
    error: categoriesError,
  } = useCategories();
  const homeGridLayout = rawHomeGridLayout || DEFAULT_HOME_GRID_LAYOUT;
  const [gridContainerWidth, setGridContainerWidth] = useState(0);
  const handleCatGridLayout = useCallback((e) => {
    const innerWidth = Math.max(0, e.nativeEvent.layout.width - SPACING[6] * 2);
    setGridContainerWidth((prev) => (Math.abs(prev - innerWidth) >= 1 ? innerWidth : prev));
  }, []);
  const gridCols = homeGridLayout.app_columns;
  const gridGap = homeGridLayout.app_card_gap;
  const gridPadding = homeGridLayout.app_card_padding;
  const gridCardRadius = homeGridLayout.app_card_radius;
  const gridLabelSize = homeGridLayout.app_label_size;
  const gridAvailableWidth =
    gridContainerWidth > 0 ? gridContainerWidth : Math.max(0, windowWidth - SPACING[6] * 2);
  const gridSlotWidthPx =
    gridAvailableWidth > 0 ? (gridAvailableWidth - gridGap * (gridCols - 1) - 1) / gridCols : 0;
  const gridSlotWidthPct =
    gridAvailableWidth > 0 && gridSlotWidthPx > 0
      ? `${Math.floor(((gridSlotWidthPx / gridAvailableWidth) * 100) * 100) / 100}%`
      : `${Math.floor((100 / gridCols) * 100) / 100}%`;
  const gridPaddingH = Math.max(4, Math.round(gridPadding * 0.75));
  const maxSafeIcon = Math.max(24, Math.floor(gridSlotWidthPx - gridPaddingH * 2));
  const gridIconSize = Math.min(homeGridLayout.app_icon_size, maxSafeIcon);
  const gridRowGap = Math.max(gridGap, 12);
  const { onScroll, resetHeader, scrollY } = useScrollHandler();
  const headerHeight = useHeaderHeight();
  const headerHidden = useHeaderHidden();
  const scrollRef = useRef(null);
  const reveal = useRevealScope('home');
  const couponScrollRef = useRef(null);
  const couponTimerRef = useRef(null);
  const couponIndexRef = useRef(0);
  const [activeCouponIndex, setActiveCouponIndex] = useState(0);
  const [categoriasBottomY, setCategoriasBottomY] = useState(null);
  const [homeCoupons, setHomeCoupons] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        refreshCategories(),
        refetchRanking(),
        fetchHomeCoupons().then((list) => {
          if (Array.isArray(list) && list.length > 0) {
            setHomeCoupons(list);
          }
        }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshCategories, refetchRanking]);

  useEffect(() => {
    let active = true;
    fetchHomeCoupons().then((list) => {
      if (active && Array.isArray(list) && list.length > 0) {
        setHomeCoupons(list);
      }
    }).catch(console.warn);
    return () => { active = false; };
  }, []);

  const stopCouponAutoplay = useCallback(() => {
    if (couponTimerRef.current) {
      clearInterval(couponTimerRef.current);
      couponTimerRef.current = null;
    }
  }, []);

  const scrollToCouponIndex = useCallback((nextIdx) => {
    const total = homeCoupons.length;
    if (total <= 0) return;
    const bounded = ((nextIdx % total) + total) % total;
    couponIndexRef.current = bounded;
    setActiveCouponIndex(bounded);
    couponScrollRef.current?.scrollTo({
      x: bounded * (HOME_COUPON_CARD_WIDTH + HOME_COUPON_GAP),
      animated: true,
    });
  }, [homeCoupons.length]);

  const startCouponAutoplay = useCallback(() => {
    stopCouponAutoplay();
    if (homeCoupons.length <= 1) return;
    couponTimerRef.current = setInterval(() => {
      const nextIdx = (couponIndexRef.current + 1) % homeCoupons.length;
      scrollToCouponIndex(nextIdx);
    }, 4500);
  }, [stopCouponAutoplay, homeCoupons.length, scrollToCouponIndex]);

  useEffect(() => {
    startCouponAutoplay();
    return () => stopCouponAutoplay();
  }, [startCouponAutoplay, stopCouponAutoplay]);

  // ── Onboarding: mostra /welcome e depois /location, cada um só na
  // primeira vez ──────────────────────────────────────────────────────────
  // Ver app/welcome.js (ALREADY_SEEN_WELCOME_KEY) e app/location.js
  // (ALREADY_SEEN_LOCATION_KEY). null = ainda checando essa etapa.
  // Ordem de prioridade em CADA etapa: permissão já concedida > flag do
  // AsyncStorage. Fica ANTES de qualquer outro hook/lógica da Home de
  // propósito, pra sair rápido via <Redirect> sem montar o resto da tela à
  // toa.
  const [needsWelcome, setNeedsWelcome] = useState(null);
  const [needsLocation, setNeedsLocation] = useState(null);

  // TESTE: deixa `true` pra forçar a tela de welcome aparecer sempre,
  // ignorando permissão de notificação e AsyncStorage. VOLTAR PRA `false`
  // antes de buildar pra produção.
  const FORCE_SHOW_WELCOME = false;

  useEffect(() => {
    if (FORCE_SHOW_WELCOME) {
      setNeedsWelcome(true);
      return;
    }

    (async () => {
      // 1) Etapa /welcome (notificações): só pula se o usuário já passou pela tela (flag salva)
      const seenWelcome = await AsyncStorage.getItem(ALREADY_SEEN_WELCOME_KEY);
      const welcomeNeeded = seenWelcome !== 'true';
      setNeedsWelcome(welcomeNeeded);

      // Se ainda falta mostrar /welcome, o fluxo leva para /welcome e em seguida /location
      if (welcomeNeeded) return;

      // 2) Etapa /location — só chega aqui se /welcome já foi visto.
      const { status: locStatus } = await Location.getForegroundPermissionsAsync();
      if (locStatus === 'granted') {
        setNeedsLocation(false);
        return;
      }
      const seenLocation = await AsyncStorage.getItem(ALREADY_SEEN_LOCATION_KEY);
      setNeedsLocation(seenLocation !== 'true');
    })();
  }, []);

  useEffect(() => {
    if (needsWelcome === null) return;
    if (needsWelcome) {
      signalAppReady();
      return;
    }
    if (needsLocation === null) return;
    if (needsLocation || !loading) {
      signalAppReady();
    }
  }, [needsWelcome, needsLocation, loading]);

  // Espaço reservado pro header no topo do conteúdo — agora é FIXO (sempre
  // igual à altura real do header), não anima mais nem encolhe/cresce. O
  // header virou puro overlay, exatamente igual a barra de categorias: ele
  // desliza por cima/some, mas nunca empurra o resto do conteúdo.
  const headerSpacerHeight = headerHeight;

  useFocusEffect(
    useCallback(() => {
      resetHeader();
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }, 50);
      fetchHomeCoupons().then((list) => {
        if (Array.isArray(list) && list.length > 0) {
          setHomeCoupons(list);
        }
      }).catch(console.warn);
    }, [resetHeader])
  );

  const disponiveis = useMemo(
    () => produtos.filter((p) => p.disponivel !== false),
    [produtos]
  );

  const homeBarItems = useMemo(
    () => getHomeBarItems(produtos),
    [getHomeBarItems, produtos]
  );

  const homeFeaturedCategories = useMemo(
    () => getHomeFeaturedCategories(produtos),
    [getHomeFeaturedCategories, produtos]
  );

  const featuredSections = useMemo(
    () =>
      homeFeaturedCategories
        .map((cat) => {
          const limit = cat.home_featured_limit || 6;
          const items = disponiveis
            .filter((p) => matchProductToCategory(p, cat))
            .slice(0, limit);
          return { category: cat, items };
        })
        .filter((sec) => sec.items.length > 0),
    [homeFeaturedCategories, disponiveis]
  );

  // Destaques: antes pegava só os 6 primeiros de `disponiveis` (ordenado por
  // ranking), o que na prática dava só batata porque elas dominam o topo do
  // ranking geral. Agora intercala por categoria (1 de cada categoria por vez,
  // respeitando o ranking dentro de cada uma) até fechar 6 itens, garantindo
  // que categorias como Macarrão também apareçam nos destaques.
  const destaques = useMemo(() => {
    const sidebarSlugs = new Set(
      (categories || [])
        .filter((c) => c.menu_layout_zone === 'sidebar_right')
        .map((c) => normalizeCategorySlug(c.slug))
    );

    const porCategoria = {};
    disponiveis.forEach((p) => {
      const catLabel = p.categoria || p.category || 'Outros';
      const slug = normalizeCategorySlug(catLabel);
      if (slug.includes('bebida') || sidebarSlugs.has(slug)) return; // exclui bebidas/sidebar dos destaques
      if (!porCategoria[catLabel]) porCategoria[catLabel] = [];
      porCategoria[catLabel].push(p);
    });

    const catKeys = Object.keys(porCategoria);
    const resultado = [];
    let i = 0;
    while (resultado.length < 6 && catKeys.some((cat) => porCategoria[cat][i])) {
      catKeys.forEach((cat) => {
        if (porCategoria[cat][i] && resultado.length < 6) {
          resultado.push(porCategoria[cat][i]);
        }
      });
      i++;
    }
    return resultado;
  }, [disponiveis, categories]);

  const displayCoupons = homeCoupons;

  // Precisa vir DEPOIS de todos os hooks (regra do React) e ANTES do JSX
  // pesado da Home — assim não desenha nada da Home à toa se for redirecionar.
  // Ordem: /welcome primeiro, /location depois, só então a Home de verdade.
  if (needsWelcome === null) {
    return <View style={{ flex: 1, backgroundColor: COLORS.background }} />;
  }
  if (needsWelcome) {
    return <Redirect href="/welcome" />;
  }
  if (needsLocation === null) {
    return <View style={{ flex: 1, backgroundColor: COLORS.background }} />;
  }
  if (needsLocation) {
    return <Redirect href="/location" />;
  }

  return (
    <View style={s.container}>
      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: SPACING[10] }}
        onScroll={(e) => { onScroll(e); reveal.onScroll(); }}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary, COLORS.secondary]}
          />
        }
      >
        {/* Espaço reservado pro header — fixo, não empurra mais nada */}
        <View style={{ height: headerSpacerHeight }} />

        {/* Capa da Batata igual ao site (Hero) com gradiente suave na base */}
        <ScrollReveal scope={reveal} revealKey="home_hero">
        <View style={s.heroCoverContainer}>
          <ExpoImage
            source={require('../assets/products/costela.jpg')}
            style={s.heroCoverImage}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.72)']}
            locations={[0, 0.5, 1]}
            style={s.heroCoverGradient}
          />
        </View>
        </ScrollReveal>

        <ScrollReveal scope={reveal} revealKey="home_header-card" style={s.headerCardWrap}>
          <RestaurantHeaderCard />
        </ScrollReveal>

        {/* ══════════════════ CATEGORIAS (estilo iFood, grid 3x2) ══════════════════ */}
        <View
          style={[s.section, { paddingTop: SPACING[4] }]}
          onLayout={(e) => setCategoriasBottomY(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
        >
          <View
            style={[s.catGrid, { columnGap: gridGap, rowGap: gridRowGap }]}
            onLayout={handleCatGridLayout}
          >
            {homeBarItems.map((cat) => {
              const itemKey = cat.id || cat.slug || cat.name;
              const badgeText =
                typeof cat.badge_text === 'string' && cat.badge_text.trim().length > 0
                  ? cat.badge_text.trim()
                  : null;
              return (
                <ScrollReveal
                  key={itemKey}
                  scope={reveal}
                  revealKey={`home_cat_${cat.slug || itemKey}`}
                  style={[s.catGridSlot, { width: gridSlotWidthPct }]}
                >
                  <Pressable
                    style={[s.catGridPress, cat.disabled && s.catGridItemDisabled]}
                    disabled={cat.disabled}
                    onPress={() => handleCategoriaPress(router, cat)}
                  >
                    <View
                      style={[
                        s.catGridBox,
                        {
                          paddingVertical: gridPadding,
                          paddingHorizontal: gridPaddingH,
                          borderRadius: gridCardRadius,
                        },
                      ]}
                    >
                      <CategoryIcon category={cat} size={gridIconSize} />
                      {badgeText ? (
                        <View
                          style={[
                            s.catGridBadge,
                            { backgroundColor: cat.badge_color || COLORS.secondary },
                          ]}
                        >
                          <Text
                            style={s.catGridBadgeText}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            maxFontSizeMultiplier={1.15}
                          >
                            {badgeText}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        s.catGridLabel,
                        {
                          fontSize: gridLabelSize,
                          lineHeight: Math.round(gridLabelSize * 1.35),
                        },
                      ]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      maxFontSizeMultiplier={1.15}
                    >
                      {cat.name}
                    </Text>
                  </Pressable>
                </ScrollReveal>
              );
            })}
          </View>
        </View>

        {/* ══════════════════ BANNERS (carrossel) ══════════════════ */}
        <ScrollReveal scope={reveal} revealKey="home_banners" style={s.section}>
          <BannerCarousel />
        </ScrollReveal>

        {categoriesError || (productsError && produtos.length > 0) ? (
          <View style={s.degradedBanner}>
            <Ionicons name="cloud-offline-outline" size={16} color={COLORS.secondary} />
            <Text style={s.degradedBannerText} numberOfLines={2}>
              Sem conexão estável. Exibindo dados salvos.
            </Text>
            <Pressable style={s.degradedRetryBtn} onPress={handleRefresh} hitSlop={6}>
              <Text style={s.degradedRetryText}>Atualizar</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ══════════════════ DESTAQUES (scroll horizontal) ══════════════════ */}
        <ScrollReveal scope={reveal} revealKey="home_destaques" style={s.section}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>Destaques</Text>
            <Pressable onPress={() => router.push('/cardapio')} style={s.verTodos}>
              <Text style={s.verTodosText}>Ver todos</Text>
              <Ionicons name="chevron-forward" size={13} color={COLORS.primary} />
            </Pressable>
          </View>

          {loading ? (
            <HomeDestaquesSkeleton />
          ) : productsError && destaques.length === 0 ? (
            <View style={s.errorCard}>
              <Ionicons name="cloud-offline-outline" size={28} color={COLORS.secondary} />
              <Text style={s.errorTitle}>Não foi possível carregar o cardápio</Text>
              <Text style={s.errorText}>Verifique sua conexão e tente novamente.</Text>
              <Pressable style={s.retryBtn} onPress={handleRefresh}>
                <Ionicons name="refresh" size={14} color={COLORS.white} />
                <Text style={s.retryBtnText}>Tentar novamente</Text>
              </Pressable>
            </View>
          ) : !loading && !productsError && disponiveis.length === 0 ? (
            <View style={s.errorCard}>
              <Ionicons name="fast-food-outline" size={28} color={COLORS.primary} />
              <Text style={s.errorTitle}>Nenhum item disponível no momento</Text>
              <Text style={s.errorText}>Nosso cardápio está sendo atualizado. Tente novamente em instantes.</Text>
              <Pressable style={s.retryBtn} onPress={handleRefresh}>
                <Ionicons name="refresh" size={14} color={COLORS.white} />
                <Text style={s.retryBtnText}>Tentar novamente</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.miniCarousel}
            >
              {destaques.map((p) => (
                <DestaqueMiniCard key={p.id} produto={p} />
              ))}
            </ScrollView>
          )}
        </ScrollReveal>

        {/* ══════════════════ CUPONS (estilo idêntico à página de cupons, com rotação automática igual ao site) ══════════════════ */}
        {displayCoupons && displayCoupons.length > 0 ? (
          <ScrollReveal scope={reveal} revealKey="home_cupons" style={s.section}>
            <View style={s.sectionRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={s.cupomSectionIcon}>
                  <Ionicons name="pricetag" size={13} color="#FFD54F" />
                </View>
                <Text style={s.sectionTitle}>Cupons disponíveis</Text>
              </View>
              <View style={s.cupomHeaderRight}>
                {displayCoupons.length > 1 ? (
                  <View style={s.cupomNavControls}>
                    <Pressable
                      onPress={() => {
                        stopCouponAutoplay();
                        scrollToCouponIndex(couponIndexRef.current - 1);
                        startCouponAutoplay();
                      }}
                      style={s.cupomNavBtn}
                      hitSlop={6}
                    >
                      <Ionicons name="chevron-back" size={14} color={COLORS.text} />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        stopCouponAutoplay();
                        scrollToCouponIndex(couponIndexRef.current + 1);
                        startCouponAutoplay();
                      }}
                      style={s.cupomNavBtn}
                      hitSlop={6}
                    >
                      <Ionicons name="chevron-forward" size={14} color={COLORS.text} />
                    </Pressable>
                  </View>
                ) : null}
                <Pressable onPress={() => router.push('/cupons')} style={s.verTodos}>
                  <Text style={s.verTodosText}>Ver todos ({displayCoupons.length})</Text>
                  <Ionicons name="chevron-forward" size={13} color={COLORS.primary} />
                </Pressable>
              </View>
            </View>
            <ScrollView
              ref={couponScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.cupomRow}
              decelerationRate="fast"
              snapToInterval={HOME_COUPON_CARD_WIDTH + HOME_COUPON_GAP}
              snapToAlignment="start"
              onScrollBeginDrag={stopCouponAutoplay}
              onMomentumScrollEnd={(e) => {
                const offsetX = e.nativeEvent.contentOffset.x;
                const newIdx = Math.round(offsetX / (HOME_COUPON_CARD_WIDTH + HOME_COUPON_GAP));
                const bounded = Math.max(0, Math.min(displayCoupons.length - 1, newIdx));
                couponIndexRef.current = bounded;
                setActiveCouponIndex(bounded);
                startCouponAutoplay();
              }}
              onScrollEndDrag={() => {
                startCouponAutoplay();
              }}
            >
              {displayCoupons.map((c) => (
                <HomeCouponCard
                  key={c.id || c.codigo}
                  coupon={c}
                  onCardPress={() => router.push('/cupons')}
                />
              ))}
            </ScrollView>
            {displayCoupons.length > 1 ? (
              <View style={s.cupomDotsRow}>
                {displayCoupons.map((c, idx) => (
                  <Pressable
                    key={c.id || c.codigo || idx}
                    onPress={() => {
                      stopCouponAutoplay();
                      scrollToCouponIndex(idx);
                      startCouponAutoplay();
                    }}
                    hitSlop={6}
                    style={[
                      s.cupomDot,
                      idx === activeCouponIndex && s.cupomDotActive,
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </ScrollReveal>
        ) : null}

        {loading && produtos.length === 0 ? (
          <View style={s.section}>
            <HomeGridSkeleton count={4} />
          </View>
        ) : (
          featuredSections.map(({ category: cat, items }) => {
            const slugNorm = normalizeCategorySlug(cat.slug);
            const sectionTitle =
              slugNorm === 'batata'
                ? 'Batatas mais pedidas'
                : slugNorm === 'macarrao'
                ? 'Macarrão mais pedidos'
                : cat.show_ranking
                ? `${cat.name} mais pedidos`
                : cat.name;
            const sectionDesc =
              slugNorm === 'batata'
                ? 'Crocantes por fora, recheadas por dentro e feitas na hora'
                : slugNorm === 'macarrao'
                ? 'Massas artesanais com molhos irresistíveis'
                : cat.description;
            const sectionMciIcon =
              slugNorm === 'batata'
                ? 'carrot'
                : slugNorm === 'macarrao'
                ? 'pasta'
                : mapFallbackIconToMci(cat.fallback_icon);
            const badgeText =
              typeof cat.badge_text === 'string' && cat.badge_text.trim().length > 0
                ? cat.badge_text.trim()
                : null;

            return (
              <View key={cat.id || cat.slug} style={s.section}>
                <ScrollReveal
                  scope={reveal}
                  revealKey={`home_sec_${cat.slug}_header`}
                  style={s.cardapioHeaderWrap}
                >
                  <View style={s.cardapioHeaderRow}>
                    <View style={s.cardapioHeaderLeft}>
                      <MaterialCommunityIcons
                        name={sectionMciIcon}
                        size={30}
                        color={COLORS.primary}
                      />
                      <Text style={s.cardapioTitle} numberOfLines={1}>{sectionTitle}</Text>
                      {badgeText ? (
                        <View
                          style={[
                            s.sectionBadge,
                            { backgroundColor: cat.badge_color || COLORS.secondary },
                          ]}
                        >
                          <Text style={s.sectionBadgeText} numberOfLines={1}>{badgeText}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() =>
                        router.push({ pathname: '/cardapio', params: { categoria: cat.slug } })
                      }
                      style={s.verTodos}
                    >
                      <Text style={s.verTodosText}>Ver todos</Text>
                      <Ionicons name="chevron-forward" size={13} color={COLORS.primary} />
                    </Pressable>
                  </View>
                  {sectionDesc ? (
                    <Text style={s.cardapioDesc}>{sectionDesc}</Text>
                  ) : null}
                </ScrollReveal>

                <View style={s.prodGrid}>
                  {items.map((p, i) => (
                    <ScrollReveal
                      key={p.id}
                      scope={reveal}
                      revealKey={`home_${cat.slug}_${p.id}`}
                    >
                      <ProdutoCard produto={p} index={i} />
                    </ScrollReveal>
                  ))}
                </View>
              </View>
            );
          })
        )}

      </ScrollView>

      <CategoriasFlutuantes
        scrollY={scrollY}
        categoriasBottomY={categoriasBottomY}
        headerHidden={headerHidden}
        router={router}
        categories={homeBarItems}
      />
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  heroCoverContainer: {
    width: '100%',
    height: 148,
    backgroundColor: '#1F1B16',
    overflow: 'hidden',
    position: 'relative',
  },
  heroCoverImage: {
    width: '100%',
    height: '100%',
  },
  heroCoverGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  headerCardWrap: {
    paddingHorizontal: SPACING[6],
    marginTop: -18,
    zIndex: 10,
  },



  // ── SECTION BASE ─────────────────────────────────────────────────────────
  section: {
    paddingTop: SPACING[6],
    gap: SPACING[4],
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[6],
  },
  sectionTitle: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.lg,
    letterSpacing: -0.3,
  },
  verTodos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  verTodosText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: TYPOGRAPHY.sizes.sm,
  },

  // ── HEADER DE SEÇÃO COM ÍCONE (ex: "Batatas mais pedidas", "Macarrão
  // mais pedidos") — ícone amarelo "solto" (sem fundo/box) à esquerda do
  // título, descrição cinza colada logo abaixo, alinhada com o início do
  // texto do título (não com o ícone) ──
  cardapioHeaderWrap: {
    paddingHorizontal: SPACING[6],
  },
  cardapioHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[3],
  },
  cardapioHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    flexShrink: 1,
  },
  cardapioTitle: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.lg,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  cardapioDesc: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.sizes.sm,
    marginTop: 1,
    marginLeft: 30 + SPACING[2],
  },
  sectionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  sectionBadgeText: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // ── CATEGORIAS (grid 3x2, estilo iFood — sem sombra/borda) ─────────────────
  catGrid: {
    paddingHorizontal: SPACING[6],
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    rowGap: SPACING[4],
  },
  catGridSlot: { width: '30%' },
  catGridPress: { width: '100%', alignItems: 'center' },
  catGridItemDisabled: {
    opacity: 0.5,
  },
  catGridBox: {
    position: 'relative',
    width: '100%',
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[2],
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  catGridBadge: {
    position: 'absolute',
    top: -5,
    right: -3,
    maxWidth: '100%',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    zIndex: 2,
  },
  catGridBadgeText: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  catGridLabel: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.sm,
    textAlign: 'center',
    includeFontPadding: false,
  },

  // ── MINI CAROUSEL (Em alta) ───────────────────────────────────────────────
  miniCarousel: {
    paddingHorizontal: SPACING[6],
    gap: SPACING[3],
  },
  miniCard: {
    width: 170,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  miniImgWrapper: {
    width: '100%',
    height: 130,
    backgroundColor: COLORS.backgroundElevated,
  },
  miniImg: {
    width: '100%',
    height: '100%',
  },
  miniBody: {
    padding: SPACING[3],
    gap: SPACING[2],
    flex: 1,
    justifyContent: 'space-between',
  },
  miniNome: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 16,
    height: 32, // fixo pra 2 linhas — evita card esticar quando nome é grande
  },
  miniPreco: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 16,
  },
  miniFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[2],
  },
  miniBtnAdd: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginVertical: 2,
  },
  miniTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  miniTagText: {
    color: COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '600',
  },


  // ── CUPONS (iFood style) ──────────────────────────────────────────────────
  cupomSectionIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#FFD54F1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFD54F33',
  },
  cupomRow: {
    paddingHorizontal: SPACING[6],
    gap: HOME_COUPON_GAP,
    paddingVertical: 4,
  },
  cupomHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cupomNavControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cupomNavBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cupomDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  cupomDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D4CFC7',
  },
  cupomDotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  cupomQtd: {
    backgroundColor: '#FFB80015',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FFB80040',
  },
  cupomQtdText: {
    color: '#B8860B',
    fontSize: 11,
    fontWeight: '700',
  },

  // ── GRID "Batatas mais pedidas" (2 colunas, largura fixa) ─────────────────
  prodGrid: {
    paddingHorizontal: SPACING[6],
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: PROD_GRID_GAP,
  },
  prodCard: {
    width: PROD_CARD_WIDTH,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  prodImgWrapper: {
    width: '100%',
    height: PROD_IMG_HEIGHT,
    position: 'relative',
  },
  prodImg: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.backgroundElevated,
  },
  prodOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  prodInfo: {
    padding: SPACING[3],
    gap: SPACING[2],
  },
  prodTitleGroup: {
    gap: 1,
  },
  prodNome: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.sm,
    lineHeight: 16,
    height: 32,
  },
  prodDesc: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.sizes.xs,
    lineHeight: 14,
    height: 28,
  },
  prodTags: {
    flexDirection: 'row',
    gap: SPACING[3],
  },
  prodTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  prodTagText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  prodFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prodPreco: {
    flexShrink: 1,
    marginRight: SPACING[2],
    color: '#000000',
    fontWeight: '800',
    fontSize: TYPOGRAPHY.sizes.base,
  },
  addBtn: {
    flexShrink: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── LOADER & FALLBACK ────────────────────────────────────────────────────
  loader: {
    alignItems: 'center',
    paddingVertical: SPACING[10],
  },
  errorCard: {
    marginHorizontal: SPACING[6],
    padding: SPACING[5],
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    gap: SPACING[2],
  },
  errorTitle: {
    color: COLORS.text,
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorText: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.sizes.xs,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: SPACING[1],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.secondary,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2],
    borderRadius: RADIUS.full,
  },
  retryBtnText: {
    color: COLORS.white,
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: '700',
  },
  degradedBanner: {
    marginHorizontal: SPACING[6],
    marginBottom: SPACING[4],
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  degradedBannerText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: '500',
  },
  degradedRetryBtn: {
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.secondary,
  },
  degradedRetryText: {
    color: COLORS.white,
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: '700',
  },

});
