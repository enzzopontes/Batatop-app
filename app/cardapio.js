import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  Image,
  ScrollView,
  Animated,
} from 'react-native';
import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { CardapioGridSkeleton } from '../components/Skeleton';
import { useProductRanking } from '../hooks/useProductRanking';
import { useBuscarProdutos } from '../hooks/useProdutos';
import { useCart } from '../utils/cartStore';

// MAPEAMENTO: label visível → valor exato no campo `category` do Supabase
const CATEGORIA_MAP = {
  'Todas':   'Todas',
  'Batatas': 'batata',
  'Macarrão':'macarrao',
  'Bebidas': 'bebida',
};

// tira acento e deixa minúsculo — mesma função do index.js, usada pra
// separar os produtos por categoria sem depender de acento/maiúscula do banco
const normalizarCategoria = (str) =>
  (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// ─── Fallbacks de imagem por categoria (mesmos do index.js) ───────────────────
const PROD_IMG_FALLBACKS = {
  batatas: 'https://images.unsplash.com/photo-1518013391915-e40643a1bce1?w=600',
  bebidas: 'https://images.unsplash.com/photo-1544145945-f904253d0c7b?w=600',
  macarrao: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600',
};

// Ícone 3D da aba "Todas"
const ICONE_TODAS = require('../assets/icones3d/iconetodos.png');

// Nome do restaurante — troque aqui se precisar
const NOME_RESTAURANTE = 'Batata Top - Delivery';

// Textos que ficam "rolando" dentro da barra de busca
const SUGESTOES_BUSCA = [
  `Buscar em ${NOME_RESTAURANTE}`,
  'Experimente nossas Batatas recheadas',
  'Peça um Macarrão bem quentinho',
  'Bebidas geladas pra acompanhar',
];

// Seções do cardápio, na ordem em que aparecem na tela — Batatas sempre
// primeiro, depois Macarrão, depois Bebidas. Dentro de cada uma os produtos
// já vêm ordenados do mais pedido pro menos pedido (ordem do ranking).
const SECOES = [
  {
    tab: 'Batatas',
    filtro: 'batata',
    titulo: 'Batatas',
    descricao: 'Crocantes por fora, recheadas por dentro e feitas na hora',
    icon: 'carrot',
  },
  {
    tab: 'Macarrão',
    filtro: 'macarrao',
    titulo: 'Macarrão',
    descricao: 'Massas artesanais com molhos irresistíveis',
    icon: 'pasta',
  },
  {
    tab: 'Bebidas',
    filtro: 'bebida',
    titulo: 'Bebidas',
    descricao: 'Geladinhas pra acompanhar seu pedido',
    icon: 'cup',
  },
];

const TABS = ['Todas', 'Batatas', 'Macarrão', 'Bebidas'];

// ─── ProdutoCard (mesmo card grande do index.js — imagem, nome, desc, tags,
// preço e botão de adicionar) ──────────────────────────────────────────────
const ProdutoCard = memo(function ProdutoCard({ produto }) {
  const router = useRouter();
  const [useFallback, setUseFallback] = useState(false);

  const imageSource = useFallback
    ? { uri: PROD_IMG_FALLBACKS[produto.categoria?.toLowerCase()] || PROD_IMG_FALLBACKS.batatas }
    : { uri: produto.imagem };

  return (
    <Pressable style={s.prodCard} onPress={() => router.push(`/produto/${produto.id}`)}>
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
  const [tabAtiva, setTabAtiva] = useState(
    TABS.includes(categoria) ? categoria : 'Todas'
  );
  const [query, setQuery] = useState('');
  const [buscaFocada, setBuscaFocada] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { count: totalItens } = useCart();

  const scrollRef = useRef(null);
  // guarda o Y de cada seção dentro do ScrollView, preenchido pelo onLayout
  // de cada seção — usado tanto pra rolar até lá quanto pra saber qual aba
  // destacar enquanto o usuário rola manualmente
  const sectionsY = useRef({});
  const scrollandoProgramaticamente = useRef(false);

  const { produtos, loading } = useProductRanking();
  const { produtos: buscados, loading: lBusca } = useBuscarProdutos(query);

  const disponiveis = produtos.filter((p) => p.disponivel);

  // separa por categoria, mantendo a ordem do ranking (mais pedido primeiro)
  const secoesComProdutos = SECOES.map((secao) => ({
    ...secao,
    produtos: disponiveis.filter((p) => normalizarCategoria(p.categoria).includes(secao.filtro)),
  }));

  const buscando = query.trim().length > 0;

  // rola suavemente até a seção da aba clicada — nem direto (sem animação),
  // nem muito devagar, o scrollTo animado padrão já dá essa velocidade média
  const irParaSecao = (tab) => {
    setTabAtiva(tab);
    setQuery('');
    if (tab === 'Todas') {
      scrollandoProgramaticamente.current = true;
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => { scrollandoProgramaticamente.current = false; }, 500);
      return;
    }
    const y = sectionsY.current[tab];
    if (y != null) {
      scrollandoProgramaticamente.current = true;
      scrollRef.current?.scrollTo({ y: Math.max(y - SPACING[3], 0), animated: true });
      setTimeout(() => { scrollandoProgramaticamente.current = false; }, 500);
    }
  };

  // enquanto o usuário rola manualmente, vai destacando a aba da seção
  // que está aparecendo na tela — igual ao iFood
  const handleScroll = (e) => {
    if (scrollandoProgramaticamente.current) return;
    const offsetY = e.nativeEvent.contentOffset.y;
    let atual = 'Todas';
    TABS.forEach((tab) => {
      const y = sectionsY.current[tab];
      if (y != null && offsetY >= y - SPACING[8]) {
        atual = tab;
      }
    });
    setTabAtiva((prev) => (prev === atual ? prev : atual));
  };

  const renderBuscadoItem = useCallback(({ item }) => <ProdutoCard produto={item} />, []);
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
          contentContainerStyle={[s.tabsRow, { flexGrow: 1, justifyContent: 'center' }]}
        >
          {TABS.map((tab) => {
            const ativo = tab === tabAtiva && !buscando;
            return (
              <Pressable
                key={tab}
                style={s.tabItem}
                onPress={() => irParaSecao(tab)}
              >
                <View style={s.tabLabelRow}>
                  {tab === 'Todas' ? (
                    <Image source={ICONE_TODAS} style={s.tabIconTodas} resizeMode="contain" />
                  ) : (
                    <Text style={[s.tabTxt, ativo ? s.tabTxtAtivo : s.tabTxtInativo]}>
                      {tab}
                    </Text>
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
            removeClippedSubviews={true}
            ListEmptyComponent={
              <View style={s.center}>
                <Ionicons name="storefront-outline" size={44} color={COLORS.border} />
                <Text style={s.emptyTitle}>Nenhum produto</Text>
                <Text style={s.emptyDesc}>Tente outra busca.</Text>
              </View>
            }
          />
        )
      ) : loading ? (
        <CardapioGridSkeleton count={6} />
      ) : (
        // sem busca: rola descendo e as seções vão aparecendo, batata sempre
        // primeiro, cada uma ordenada do produto mais pedido pro menos pedido
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {secoesComProdutos.map((secao) => (
            <View
              key={secao.tab}
              style={s.section}
              onLayout={(e) => { sectionsY.current[secao.tab] = e.nativeEvent.layout.y; }}
            >
              <View style={s.cardapioHeaderWrap}>
                <View style={s.cardapioHeaderLeft}>
                  <MaterialCommunityIcons name={secao.icon} size={30} color={COLORS.primary} />
                  <Text style={s.cardapioTitle} numberOfLines={1}>{secao.titulo}</Text>
                </View>
                <Text style={s.cardapioDesc}>{secao.descricao}</Text>
              </View>

              {secao.produtos.length === 0 ? (
                <View style={s.center}>
                  <Text style={s.emptyDesc}>Nenhum produto nessa categoria ainda.</Text>
                </View>
              ) : (
                <View style={s.prodGrid}>
                  {secao.produtos.map((p) => (
                    <ProdutoCard key={p.id} produto={p} />
                  ))}
                </View>
              )}
            </View>
          ))}
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
    gap: 28,
    paddingHorizontal: SPACING[5],
  },
  tabItem: {
    alignItems: 'center',
    paddingBottom: 0,
  },
  tabLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
  },
  tabIconTodas: {
    width: 30,
    height: 30,
  },
  tabTxt: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: '700',
  },
  tabTxtAtivo:   { color: COLORS.text      },
  tabTxtInativo: { color: COLORS.textMuted },
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
    paddingBottom: SPACING[12],
  },
  section: {
    paddingTop: SPACING[1],
    gap: SPACING[2],
  },
  cardapioHeaderWrap: {
    paddingHorizontal: SPACING[5],
  },
  cardapioHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
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
    marginTop: 2,
  },

  // LISTA (busca)
  listContent: {
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[4],
    paddingBottom: SPACING[12],
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
    gap: SPACING[4],
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
    paddingTop: SPACING[16],
    gap: SPACING[3],
  },
  emptyTitle: { color: COLORS.text,    fontWeight: '700', fontSize: TYPOGRAPHY.sizes.base },
  emptyDesc:  { color: COLORS.textMuted, fontSize: TYPOGRAPHY.sizes.sm },
});
