import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Animated,
  RefreshControl,
} from 'react-native';
import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { CardapioGridSkeleton } from '../components/Skeleton';
import { useProductRanking } from '../hooks/useProductRanking';
import { useBuscarProdutos } from '../hooks/useProdutos';
import { useCategories, matchProductToCategory } from '../hooks/useCategories';
import CategoryIcon from '../components/CategoryIcon';
import { normalizeCategorySlug } from '../utils/resolveCategoryIcon';
import { useCart } from '../utils/cartStore';
import { ScrollReveal, useRevealScope, REVEAL_VIEWABILITY_CONFIG } from '../components/ui/ScrollReveal';

// ─── Fallbacks locais de imagem por categoria (mesmos do index.js) ────────────
const LOCAL_BATATA_FALLBACK = require('../assets/products/costela.jpg');
const LOCAL_GENERIC_FALLBACK = require('../assets/ui/placeholder.jpg');
const PROD_IMG_FALLBACKS = {
  batata: LOCAL_BATATA_FALLBACK,
  batatas: LOCAL_BATATA_FALLBACK,
  bebida: LOCAL_GENERIC_FALLBACK,
  bebidas: LOCAL_GENERIC_FALLBACK,
  macarrao: LOCAL_GENERIC_FALLBACK,
};

// Nome do restaurante — troque aqui se precisar
const NOME_RESTAURANTE = 'Batata Top - Delivery';

// Textos que ficam "rolando" dentro da barra de busca
const SUGESTOES_BUSCA = [
  `Buscar em ${NOME_RESTAURANTE}`,
  'Experimente nossas Batatas recheadas',
  'Peça um Macarrão bem quentinho',
  'Bebidas geladas pra acompanhar',
];

function resolveTargetCategorySlug(rawParam, menuCategories) {
  if (!rawParam) return 'todos';
  const norm = normalizeCategorySlug(String(rawParam));
  if (!norm || norm === 'todas' || norm === 'todos' || norm === 'cardapio') {
    return 'todos';
  }
  const exact = menuCategories.find(
    (cat) =>
      normalizeCategorySlug(cat.slug) === norm ||
      normalizeCategorySlug(cat.name) === norm
  );
  if (exact) return exact.slug;

  const partial = menuCategories.find((cat) => {
    const slugNorm = normalizeCategorySlug(cat.slug);
    const nameNorm = normalizeCategorySlug(cat.name);
    return (
      (slugNorm && (slugNorm.includes(norm) || norm.includes(slugNorm))) ||
      (nameNorm && (nameNorm.includes(norm) || norm.includes(nameNorm)))
    );
  });
  return partial ? partial.slug : 'todos';
}

// ─── ProdutoCard (mesmo card grande do index.js — imagem, nome, desc, tags,
// preço e botão de adicionar) ──────────────────────────────────────────────
const ProdutoCard = memo(function ProdutoCard({ produto }) {
  const router = useRouter();
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    setUseFallback(false);
  }, [produto?.imagem]);

  const fallbackKey = normalizeCategorySlug(produto.categoria);
  const imageSource =
    useFallback || !produto.imagem
      ? (PROD_IMG_FALLBACKS[fallbackKey] || LOCAL_GENERIC_FALLBACK)
      : { uri: produto.imagem };

  return (
    <Pressable style={[s.prodCard, s.prodCardFill]} onPress={() => router.push(`/produto/${produto.id}`)}>
      <View style={s.prodImgWrapper}>
        <ExpoImage
          source={imageSource}
          style={s.prodImg}
          cachePolicy="memory-disk"
          onError={() => setUseFallback(true)}
        />
        <View style={s.prodOverlay} />
      </View>

      <View style={s.prodInfo}>
        <View style={s.prodTitleGroup}>
          <Text style={s.prodNome} numberOfLines={2}>{produto.nome}</Text>
          <Text style={s.prodDesc} numberOfLines={2}>{produto.descricao}</Text>
        </View>
        {(Boolean(produto.tempo) || produto.avaliacoes != null) && (
          <View style={s.prodTags}>
            {Boolean(produto.tempo) && (
              <View style={s.prodTag}>
                <Ionicons name="time-outline" size={10} color={COLORS.textMuted} />
                <Text style={s.prodTagText}>{produto.tempo} min</Text>
              </View>
            )}
            {produto.avaliacoes != null && (
              <View style={s.prodTag}>
                <Ionicons name="star" size={10} color={COLORS.primary} />
                <Text style={s.prodTagText}>{produto.avaliacoes}</Text>
              </View>
            )}
          </View>
        )}
        <View style={s.prodFooter}>
          <Text style={s.prodPreco} numberOfLines={1}>{produto.precoFormatado}</Text>
          <Pressable style={s.addBtn} onPress={() => router.push(`/produto/${produto.id}`)}>
            <Ionicons name="add" size={16} color={COLORS.background} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
});

// ─── Texto animado "rolando" dentro da barra de busca ────────────────────────
function BuscaAnimada({ visivel }) {
  const [index, setIndex] = useState(0);
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visivel) return;
    const trocar = () => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -16, duration: 260, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => {
        setIndex((prev) => (prev + 1) % SUGESTOES_BUSCA.length);
        translateY.setValue(16);
        Animated.parallel([
          Animated.timing(translateY, { toValue: 0, duration: 260, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        ]).start();
      });
    };
    const timer = setInterval(trocar, 4000);
    return () => clearInterval(timer);
  }, [visivel]);

  if (!visivel) return null;

  return (
    <View style={s.suggestionClip} pointerEvents="none">
      <Animated.Text
        style={[s.searchPlaceholderTxt, { opacity, transform: [{ translateY }] }]}
        numberOfLines={1}
      >
        {SUGESTOES_BUSCA[index]}
      </Animated.Text>
    </View>
  );
}

// ─── Tela de Cardápio ─────────────────────────────────────────────────────────

export default function Cardapio() {
  const { categoria } = useLocalSearchParams();
  const rawCategoria = Array.isArray(categoria) ? categoria[0] : categoria;

  const [tabAtiva, setTabAtiva] = useState('todos');
  const [query, setQuery] = useState('');
  const [buscaFocada, setBuscaFocada] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { count: totalItens } = useCart();

  const scrollRef = useRef(null);
  const reveal = useRevealScope('cardapio');
  // guarda o Y de cada seção dentro do ScrollView, preenchido pelo onLayout
  // de cada seção — usado tanto pra rolar até lá quanto pra saber qual aba
  // destacar enquanto o usuário rola manualmente
  const sectionsY = useRef({});
  const scrollandoProgramaticamente = useRef(false);
  const autoScrolledKeyRef = useRef(null);

  const {
    produtos,
    loading: loadingProdutos,
    error: productsError,
    refetch,
  } = useProductRanking();
  const {
    categories,
    loading: loadingCategories,
    error: categoriesError,
    refresh: refreshCategories,
    getMenuCategories,
  } = useCategories();
  const {
    produtos: buscados,
    loading: lBusca,
    error: buscaError,
    refetch: refetchBusca,
  } = useBuscarProdutos(query);

  const disponiveis = useMemo(
    () => produtos.filter((p) => p.disponivel !== false),
    [produtos]
  );

  // Categorias dinâmicas ordenadas por menu_order, ocultando automaticamente as com 0 produtos ativos
  const menuCategories = useMemo(
    () => getMenuCategories(produtos),
    [getMenuCategories, produtos]
  );

  const tabs = useMemo(() => {
    const todosCategory = categories.find(
      (c) => normalizeCategorySlug(c.slug) === 'todos'
    );
    const allTab = {
      ...todosCategory,
      slug: 'todos',
      name: 'Todas',
      isAll: true,
      fallback_icon: todosCategory?.fallback_icon || 'LayoutGrid',
    };
    return [allTab, ...menuCategories];
  }, [categories, menuCategories]);

  // separa por categoria, mantendo a ordem do ranking (mais pedido primeiro)
  const secoesComProdutos = useMemo(
    () =>
      menuCategories
        .map((secao) => ({
          ...secao,
          produtos: disponiveis.filter((p) => matchProductToCategory(p, secao)),
        }))
        .filter((secao) => secao.produtos.length > 0),
    [menuCategories, disponiveis]
  );

  const targetSlug = useMemo(
    () => resolveTargetCategorySlug(rawCategoria, secoesComProdutos),
    [rawCategoria, secoesComProdutos]
  );

  const autoScrollKey = rawCategoria && targetSlug !== 'todos'
    ? `${String(rawCategoria)}::${targetSlug}`
    : null;

  const buscando = query.trim().length > 0;
  const loading = (loadingProdutos || loadingCategories) && produtos.length === 0;
  const hasFatalError = Boolean(productsError) && produtos.length === 0 && !loading;
  const showFallbackBanner =
    !hasFatalError &&
    (Boolean(categoriesError) ||
      (Boolean(productsError) && produtos.length > 0));

  const tryAutoScrollToTarget = useCallback(
    (slug, key) => {
      if (!slug || slug === 'todos' || !key) return;
      if (autoScrolledKeyRef.current === key) return;
      const y = sectionsY.current[slug];
      if (y == null) return;

      autoScrolledKeyRef.current = key;
      setTabAtiva(slug);
      scrollandoProgramaticamente.current = true;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: Math.max(y - SPACING[3], 0), animated: true });
      });
      setTimeout(() => {
        scrollandoProgramaticamente.current = false;
      }, 550);
    },
    []
  );

  // Quando o param `categoria` chega (ou muda) e a seção já está medida, rola uma vez
  useEffect(() => {
    if (!autoScrollKey || buscando) return;
    setTabAtiva(targetSlug);
    tryAutoScrollToTarget(targetSlug, autoScrollKey);
  }, [autoScrollKey, targetSlug, buscando, tryAutoScrollToTarget]);

  // Garante que a aba ativa existe após atualizações realtime das categorias
  useEffect(() => {
    if (tabAtiva === 'todos') return;
    if (tabs.length > 1 && !tabs.some((t) => t.slug === tabAtiva)) {
      setTabAtiva('todos');
    }
  }, [tabs, tabAtiva]);

  const handleSectionLayout = useCallback(
    (slug, y) => {
      sectionsY.current[slug] = y;
      if (autoScrollKey && slug === targetSlug && !buscando) {
        tryAutoScrollToTarget(targetSlug, autoScrollKey);
      }
    },
    [autoScrollKey, targetSlug, buscando, tryAutoScrollToTarget]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([refreshCategories(), refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshCategories, refetch]);

  // rola suavemente até a seção da aba clicada — nem direto (sem animação),
  // nem muito devagar, o scrollTo animado padrão já dá essa velocidade média
  const irParaSecao = (tabSlug) => {
    setTabAtiva(tabSlug);
    setQuery('');
    if (tabSlug === 'todos') {
      scrollandoProgramaticamente.current = true;
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => { scrollandoProgramaticamente.current = false; }, 500);
      return;
    }
    const y = sectionsY.current[tabSlug];
    if (y != null) {
      scrollandoProgramaticamente.current = true;
      scrollRef.current?.scrollTo({ y: Math.max(y - SPACING[3], 0), animated: true });
      setTimeout(() => { scrollandoProgramaticamente.current = false; }, 500);
    }
  };

  // enquanto o usuário rola manualmente, vai destacando a aba da seção
  // que está aparecendo na tela — igual ao iFood
  const handleScroll = (e) => {
    reveal.onScroll();
    if (scrollandoProgramaticamente.current) return;
    const offsetY = e.nativeEvent.contentOffset.y;
    let atual = 'todos';
    secoesComProdutos.forEach((secao) => {
      const y = sectionsY.current[secao.slug];
      if (y != null && offsetY >= y - SPACING[8]) {
        atual = secao.slug;
      }
    });
    setTabAtiva((prev) => (prev === atual ? prev : atual));
  };

  const renderBuscadoItem = useCallback(
    ({ item }) => (
      <ScrollReveal scope={reveal} revealKey={`cardapio_produto_${item.id}`} style={s.prodCardSlot}>
        <ProdutoCard produto={item} />
      </ScrollReveal>
    ),
    [reveal]
  );
  const keyExtractorBuscado = useCallback((item) => String(item.id), []);

  return (
    <View style={s.screen}>

      {/* HEADER — respeita a barra de notificação/status bar */}
      <View style={[s.header, { paddingTop: insets.top + SPACING[2] }]}>

        <View style={s.topRow}>
          <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
          </Pressable>

          <View style={s.searchBox}>
            <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
            <View style={s.searchInputWrap}>
              <TextInput
                style={s.searchInput}
                value={query}
                onChangeText={setQuery}
                onFocus={() => setBuscaFocada(true)}
                onBlur={() => setBuscaFocada(false)}
                returnKeyType="search"
              />
              <BuscaAnimada visivel={!buscaFocada && query.length === 0} />
            </View>
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </Pressable>
            )}
          </View>

          <Pressable style={s.cartBtn} onPress={() => router.push('/cart')} hitSlop={8}>
            <Ionicons name="cart-outline" size={24} color={COLORS.text} />
            {totalItens > 0 && (
              <View style={s.cartBadge}>
                <Text style={s.cartBadgeTxt}>{totalItens}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* CATEGORIAS — agora funcionam como âncora: clicar rola até a seção */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ width: '100%' }}
          contentContainerStyle={[
            s.tabsRow,
            tabs.length <= 4 && { flexGrow: 1, justifyContent: 'center' },
          ]}
        >
          {tabs.map((tab) => {
            const ativo = tab.slug === tabAtiva && !buscando;
            return (
              <Pressable
                key={tab.id || tab.slug}
                style={s.tabItem}
                onPress={() => irParaSecao(tab.slug)}
              >
                <View style={s.tabLabelRow}>
                  {tab.isAll ? (
                    <>
                      <CategoryIcon category={tab} iconScale={tab.icon_scale} size={22} />
                      <Text style={[s.tabTxt, ativo ? s.tabTxtAtivo : s.tabTxtInativo]} numberOfLines={1}>
                        {tab.name}
                      </Text>
                    </>
                  ) : (
                    <>
                      <CategoryIcon category={tab} iconScale={tab.icon_scale} size={20} />
                      <Text style={[s.tabTxt, ativo ? s.tabTxtAtivo : s.tabTxtInativo]} numberOfLines={1}>
                        {tab.name}
                      </Text>
                      {Boolean(tab.badge_text) && (
                        <View
                          style={[
                            s.tabBadgePill,
                            { backgroundColor: tab.badge_color || COLORS.secondary },
                          ]}
                        >
                          <Text style={s.tabBadgeTxt} numberOfLines={1}>
                            {tab.badge_text}
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                </View>
                {ativo && <View style={s.tabUnderline} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── CONTEÚDO ── */}
      {buscando ? (
        // busca ativa: some com as seções e mostra resultado em grade, igual antes
        lBusca ? (
          <CardapioGridSkeleton count={4} />
        ) : (
          <FlatList
            data={buscados}
            keyExtractor={keyExtractorBuscado}
            renderItem={renderBuscadoItem}
            numColumns={2}
            columnWrapperStyle={s.row}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            onScroll={reveal.onScroll}
            scrollEventThrottle={16}
            onViewableItemsChanged={reveal.onViewableItemsChanged}
            viewabilityConfig={REVEAL_VIEWABILITY_CONFIG}
            removeClippedSubviews={true}
            ListEmptyComponent={
              buscaError ? (
                <View style={s.center}>
                  <Ionicons name="cloud-offline-outline" size={44} color={COLORS.textMuted} />
                  <Text style={s.emptyTitle}>Erro ao buscar produtos</Text>
                  <Text style={s.emptyDesc}>Verifique sua conexão e tente novamente.</Text>
                  <Pressable style={s.ctaBtn} onPress={refetchBusca}>
                    <Text style={s.ctaBtnTxt}>Tentar novamente</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={s.center}>
                  <Ionicons name="search-outline" size={44} color={COLORS.border} />
                  <Text style={s.emptyTitle}>Nenhum produto encontrado</Text>
                  <Text style={s.emptyDesc}>Não encontramos itens para "{query.trim()}".</Text>
                  <Pressable style={s.ctaBtn} onPress={() => setQuery('')}>
                    <Text style={s.ctaBtnTxt}>Limpar busca</Text>
                  </Pressable>
                </View>
              )
            }
          />
        )
      ) : loading ? (
        <CardapioGridSkeleton count={6} />
      ) : hasFatalError ? (
        <View style={s.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={COLORS.textMuted} />
          <Text style={s.emptyTitle}>Não foi possível carregar o cardápio</Text>
          <Text style={s.emptyDesc}>Verifique sua conexão e tente novamente.</Text>
          <Pressable style={s.ctaBtn} onPress={handleRefresh}>
            <Text style={s.ctaBtnTxt}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        // sem busca: rola descendo e as seções vão aparecendo na ordem de menu_order,
        // cada uma ordenada do produto mais pedido pro menos pedido
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
        >
          {showFallbackBanner && (
            <Pressable style={s.offlineBanner} onPress={handleRefresh}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.warningText} />
              <Text style={s.offlineBannerTxt}>
                Mostrando versão salva. Toque ou puxe para atualizar.
              </Text>
            </Pressable>
          )}

          {secoesComProdutos.length === 0 ? (
            <View style={s.center}>
              <Ionicons name="storefront-outline" size={48} color={COLORS.border} />
              <Text style={s.emptyTitle}>Cardápio sem itens ativos</Text>
              <Text style={s.emptyDesc}>Nenhum produto disponível no momento.</Text>
              <Pressable style={s.ctaBtn} onPress={handleRefresh}>
                <Text style={s.ctaBtnTxt}>Atualizar cardápio</Text>
              </Pressable>
            </View>
          ) : (
            secoesComProdutos.map((secao) => {
              const slugNorm = normalizeCategorySlug(secao.slug);
              const is3dSection = slugNorm === 'batata' || slugNorm === 'macarrao';
              return (
                <View
                  key={secao.id || secao.slug}
                  style={s.section}
                  onLayout={(e) => handleSectionLayout(secao.slug, e.nativeEvent.layout.y)}
                >
                  <ScrollReveal scope={reveal} revealKey={`cardapio_header_${secao.slug}`} style={s.cardapioHeaderWrap}>
                    <View style={s.cardapioHeaderRow}>
                      <View style={s.cardapioHeaderLeft}>
                        <CategoryIcon
                          category={secao}
                          iconScale={secao.icon_scale}
                          size={is3dSection ? 28 : 26}
                          style={is3dSection ? s.section3dIcon : undefined}
                        />
                        <Text style={s.cardapioTitle} numberOfLines={2}>{secao.name}</Text>
                        {Boolean(secao.badge_text) && (
                          <View
                            style={[
                              s.sectionBadgePill,
                              { backgroundColor: secao.badge_color || COLORS.secondary },
                            ]}
                          >
                            <Text style={s.sectionBadgeTxt} numberOfLines={1}>
                              {secao.badge_text}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.sectionCountTxt}>
                        {secao.produtos.length} {secao.produtos.length === 1 ? 'item' : 'itens'}
                      </Text>
                    </View>
                    {Boolean(secao.description) && (
                      <Text style={s.cardapioDesc}>{secao.description}</Text>
                    )}
                  </ScrollReveal>

                  <View style={s.prodGrid}>
                    {secao.produtos.map((p) => (
                      <ScrollReveal key={p.id} scope={reveal} revealKey={`cardapio_produto_${p.id}`} style={s.prodCardSlot}>
                        <ProdutoCard produto={p} />
                      </ScrollReveal>
                    ))}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── StyleSheet ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },

  // HEADER
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingHorizontal: SPACING[5],
    paddingBottom: SPACING[3],
  },

  backBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    backgroundColor: '#F0F0F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // BARRA DE BUSCA
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    paddingHorizontal: SPACING[4],
    height: 44,
    backgroundColor: '#EDEDEF',
    borderRadius: RADIUS.xl,
  },
  searchInputWrap: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
  },
  searchInput: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.text,
    paddingVertical: 0,
    height: '100%',
  },
  suggestionClip: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 18,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  searchPlaceholderTxt: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textMuted,
  },

  // CARRINHO
  cartBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: COLORS.error ?? '#E63535',
    borderRadius: RADIUS.full,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  cartBadgeTxt: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  // CATEGORIAS (âncoras)
  tabsRow: {
    flexDirection: 'row',
    gap: 20,
    paddingHorizontal: SPACING[5],
  },
  tabItem: {
    alignItems: 'center',
    paddingBottom: 0,
  },
  tabLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
  },
  tabTxt: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: '700',
  },
  tabTxtAtivo:   { color: COLORS.text      },
  tabTxtInativo: { color: COLORS.textMuted },
  tabBadgePill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
  },
  tabBadgeTxt: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  tabUnderline: {
    marginTop: 1,
    height: 2,
    width: '100%',
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
  },

  // SCROLL / SEÇÕES
  scrollContent: {
    paddingTop: SPACING[4],
    paddingBottom: 48,
    gap: SPACING[5],
  },
  section: {
    paddingTop: SPACING[1],
    gap: SPACING[3],
  },
  cardapioHeaderWrap: {
    paddingHorizontal: SPACING[5],
  },
  cardapioHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[2],
  },
  cardapioHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    flexShrink: 1,
  },
  section3dIcon: {
    width: 28,
    height: 28,
    flexShrink: 0,
  },
  cardapioTitle: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.lg,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  sectionBadgePill: {
    flexShrink: 0,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  sectionBadgeTxt: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  sectionCountTxt: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: '600',
    flexShrink: 0,
  },
  cardapioDesc: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.sizes.sm,
    marginTop: 2,
  },

  // LISTA (busca)
  listContent: {
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[4],
    paddingBottom: 48,
    gap: SPACING[4],
  },
  row: {
    justifyContent: 'space-between',
    gap: SPACING[4],
  },

  // GRID (seções e busca)
  prodGrid: {
    paddingHorizontal: SPACING[5],
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: SPACING[4],
  },

  // CARD GRANDE — igual ao do index.js
  prodCard: {
    width: '47%',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  prodCardSlot: { width: '47%' },
  prodCardFill: { width: '100%' },
  prodImgWrapper: {
    width: '100%',
    height: 140,
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

  // STATES
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
    paddingHorizontal: SPACING[6],
    gap: SPACING[3],
  },
  emptyTitle: { color: COLORS.text, fontWeight: '700', fontSize: TYPOGRAPHY.sizes.base, textAlign: 'center' },
  emptyDesc:  { color: COLORS.textMuted, fontSize: TYPOGRAPHY.sizes.sm, textAlign: 'center' },
  ctaBtn: {
    marginTop: SPACING[2],
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING[5],
    paddingVertical: SPACING[3],
    borderRadius: RADIUS.lg,
  },
  ctaBtnTxt: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.sm,
  },
  offlineBanner: {
    marginHorizontal: SPACING[5],
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  offlineBannerTxt: {
    flex: 1,
    color: COLORS.warningText,
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: '600',
  },
});
